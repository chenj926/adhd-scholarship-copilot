function scheduleCheckIns(minutes, checkIns) {
  const now = Date.now();
  const add = (m) => chrome.alarms.create(`ci_${m}`, { when: now + m * 60 * 1000 });
  (checkIns || []).forEach(ci => {
    const m = parseInt(ci.split("+")[1]) || 5;
    add(m);
  });
  chrome.alarms.create("endBlock", { when: now + (minutes || 20) * 60 * 1000 });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "START_BLOCK") {
    scheduleCheckIns(msg.minutes, msg.checkIns);
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "Focus started",
      message: `Block running for ${msg.minutes} min`
    });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("ci_")) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "Check-in",
      message: "How's it going? Need a 30-sec tip?"
    });
  }
  if (alarm.name === "endBlock") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "Time!",
      message: "2-min debrief: What worked? What to change next time?"
    });
  }
});
