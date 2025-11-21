// Example: hook focus chain into form events
import { startChain, incrementChain, finishChain } from "./focusChain";
import { awardXp } from "./avatarProgress";

// Start when user starts an application (e.g. they click "Start plan"):
startChain("demo-user", window.location.href);

// Increment chain when a field is finished:
document.addEventListener(
  "blur",
  (e) => {
    const target = e.target as HTMLElement;
    if (!target) return;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
      incrementChain();
      // Optional: award small XP for each field
      awardXp("demo-user", window.location.href, 10, "field_complete");
    }
  },
  true
);

// When form submitted successfully:
document.querySelector("form")?.addEventListener("submit", () => {
  finishChain();
  awardXp("demo-user", window.location.href, 300, "form_submitted");
});
