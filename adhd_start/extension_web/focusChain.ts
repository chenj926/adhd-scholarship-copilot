// adhd_start/extension/focusChain.ts
// -------------------------------------------------------
// Game 4: "Focus Chain"
// Inspired by Forest: every on-task field completion
// increases the chain; tab switching breaks it.
// -------------------------------------------------------

import { sendFeedback, NudgeOutcome } from "./api";

interface ChainState {
  userId: string;
  appId: string;
  chain: number;
  broken: boolean;
  lastActive: number;
}

const KEY = "adhd_focus_chain";

function now() {
  return Date.now();
}

export async function loadChain(): Promise<ChainState | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get([KEY], (data) => {
      resolve((data[KEY] as ChainState) || null);
    });
  });
}

export async function saveChain(state: ChainState | null): Promise<void> {
  return new Promise((resolve) => {
    if (!state) {
      chrome.storage.local.remove([KEY], () => resolve());
    } else {
      chrome.storage.local.set({ [KEY]: state }, () => resolve());
    }
  });
}

/**
 * Called when user begins actively working on an application.
 */
export async function startChain(userId: string, appId: string): Promise<void> {
  const state: ChainState = {
    userId,
    appId,
    chain: 0,
    broken: false,
    lastActive: now(),
  };
  await saveChain(state);
  renderBadge(state);
}

/**
 * Increment chain when user completes a meaningful step
 * (e.g., field blur, clicking "Next").
 */
export async function incrementChain(): Promise<void> {
  const state = await loadChain();
  if (!state || state.broken) return;
  state.chain += 1;
  state.lastActive = now();
  await saveChain(state);
  renderBadge(state);
}

/**
 * Called when we detect the user has left the tab for too long.
 */
export async function breakChain(reason: string): Promise<void> {
  const state = await loadChain();
  if (!state || state.broken) return;
  state.broken = true;
  await saveChain(state);
  renderBadge(state, true);

  const nudge: NudgeOutcome = "fail";
  await sendFeedback({
    user_id: state.userId,
    reasons: [`focus_chain_break_${reason}`],
    nudge_result: { focus_chain: nudge },
  });
}

/**
 * Called when user finishes or submits the application.
 */
export async function finishChain(): Promise<void> {
  const state = await loadChain();
  if (!state) return;
  await sendFeedback({
    user_id: state.userId,
    reasons: ["focus_chain_finish"],
    nudge_result: { focus_chain: "success" },
  });
  await saveChain(null);
  removeBadge();
}

// --- UI helpers ---

function renderBadge(state: ChainState, justBroken = false): void {
  let badge = document.getElementById(
    "adhd-focus-chain"
  ) as HTMLDivElement | null;
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "adhd-focus-chain";
    badge.style.position = "fixed";
    badge.style.bottom = "10px";
    badge.style.right = "10px";
    badge.style.zIndex = "999999";
    badge.style.background = "#111827";
    badge.style.color = "#e5e7eb";
    badge.style.padding = "4px 10px";
    badge.style.borderRadius = "999px";
    badge.style.fontSize = "12px";
    document.body.appendChild(badge);
  }
  if (justBroken) {
    badge.textContent = `Focus Chain: broken at ${state.chain}`;
    badge.style.background = "#7f1d1d";
  } else {
    badge.textContent = `Focus Chain: ${state.chain}`;
    badge.style.background = "#1e293b";
  }
}

function removeBadge(): void {
  document.getElementById("adhd-focus-chain")?.remove();
}

// Tab visibility tracking – break chain if hidden > 10 seconds
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    const startHidden = now();
    setTimeout(async () => {
      if (
        document.visibilityState === "hidden" &&
        now() - startHidden >= 10_000
      ) {
        await breakChain("tab_hidden");
      }
    }, 10_000);
  }
});
