// popup.ts
// @ts-nocheck
// ---------- Small helpers ----------
const $ = (sel) => document.querySelector(sel);
const API_BASE = "http://127.0.0.1:8000";
const API_URL = `${API_BASE}/plan`;
const PARSE_URL = `${API_BASE}/parse`;
const BOOKMARK_URL = `${API_BASE}/bookmark`;
const BOOKMARKS_URL = `${API_BASE}/bookmarks?user_id=demo-user`;
const ELIGIBILITY_URL = `${API_BASE}/eligibility`;
const GOAL_DEFAULT = "Help me start this application";
const PROFILE_PAGE_URL = chrome.runtime.getURL("profile.html");
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id)
        throw new Error("No active tab");
    return tab;
}
/** Capture up to ~8k chars of VISIBLE text from current page */
async function captureVisibleText() {
    const tab = await getActiveTab();
    const [exec] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => (document.body?.innerText || "").slice(0, 8000),
    });
    return exec?.result || "";
}
// ---------- PLAN ----------
async function requestPlan(goal, text) {
    const resp = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, text }),
    });
    if (!resp.ok)
        throw new Error("Server error. Is FastAPI running on :8000?");
    return (await resp.json());
}
function renderPlan(el, data) {
    const policyBadge = data.ai_policy === "coach_only"
        ? `<span style="padding:2px 6px;border-radius:8px;background:#fff3cd;color:#8a6d3b;border:1px solid #ffeeba;">AI drafting restricted</span>`
        : "";
    el.innerHTML =
        `<div style="line-height:1.55">` +
            `<div><b>Micro-start:</b> ${escapeHtml(data.micro_start)}</div>` +
            `<div><b>Block:</b> ${data.block_minutes} min</div>` +
            `<div><b>Check-ins:</b> ${(data.check_ins || []).join(", ")}</div>` +
            (data.purpose
                ? `<div><b>Purpose:</b> ${escapeHtml(data.purpose)}</div>`
                : "") +
            (data.deadline
                ? `<div><b>Deadline:</b> ${escapeHtml(data.deadline)}</div>`
                : "") +
            (policyBadge ? `<div style="margin-top:6px">${policyBadge}</div>` : "") +
            `</div>`;
}
function startBlock(minutes, checkIns) {
    chrome.runtime.sendMessage({
        type: "START_BLOCK",
        minutes: minutes || 20,
        checkIns: checkIns?.length ? checkIns : ["T+5", "T+12"],
    });
}
async function onClickPlan() {
    const result = $("#result");
    const goalInput = $("#goal");
    result.textContent = "Capturing page text…";
    try {
        const pageText = await captureVisibleText();
        result.textContent = "Thinking…";
        const goal = (goalInput?.value || "").trim() || GOAL_DEFAULT;
        const data = await requestPlan(goal, pageText);
        renderPlan(result, data);
        startBlock(data.block_minutes, data.check_ins);
    }
    catch (err) {
        console.error(err);
        result.textContent = err?.message || "Something went wrong.";
    }
}
// ---------- PARSE / REQUIREMENTS ----------
async function requestParse(text) {
    const resp = await fetch(PARSE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "demo-user", text }),
    });
    if (!resp.ok)
        throw new Error("Parse error. Is FastAPI running on :8000?");
    return (await resp.json());
}
function renderReqs(container, data) {
    const badge = data.ai_policy === "coach_only"
        ? `<div style="margin:6px 0;padding:6px;border-radius:8px;background:#fff3cd;color:#8a6d3b;border:1px solid #ffeeba;">
           This page forbids AI-written text. Coach-only mode suggested.
         </div>`
        : "";
    const refs = data.refs_required ?? "—";
    const valuesList = (data.values || [])
        .map((v) => `<li>${escapeHtml(v)}</li>`)
        .join("");
    const conf = data.confidence != null
        ? ` (~${Math.round(data.confidence * 100)}% sure)`
        : "";
    container.innerHTML =
        (data.deadline
            ? `<div><b>Deadline:</b> ${escapeHtml(data.deadline)}</div>`
            : "") +
            `<div><b>References:</b> ${refs}</div>` +
            (valuesList
                ? `<div><b>Values / Criteria:</b><ul style="margin:6px 0 0 16px">${valuesList}</ul></div>`
                : "") +
            badge +
            (conf ? `<div class="muted" style="margin-top:4px">Confidence${conf}</div>` : "");
}
// ---------- PROFILE LOADER (chrome.storage) ----------
function getProfileFromStorage() {
    return new Promise((resolve) => {
        chrome.storage.sync.get("userProfile", (res) => {
            resolve(res.userProfile || null);
        });
    });
}
// ---------- BOOKMARKS: SAVE & LIST ----------
async function saveCurrentPage() {
    const statusEl = document.getElementById("save-status");
    if (statusEl)
        statusEl.textContent = "Saving…";
    try {
        const tab = await getActiveTab();
        const url = tab.url || "";
        const title = tab.title || "Saved scholarship";
        let host = "";
        try {
            host = url ? new URL(url).hostname : "";
        }
        catch {
            host = "";
        }
        const payload = {
            user_id: "demo-user",
            url,
            title,
            source_site: host || null,
            deadline: null,
            tags: [],
        };
        const resp = await fetch(BOOKMARK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!resp.ok)
            throw new Error("Bookmark error");
        const data = await resp.json();
        console.log("Bookmark saved:", data);
        if (statusEl)
            statusEl.textContent = "Saved ✔";
    }
    catch (err) {
        console.error(err);
        if (statusEl)
            statusEl.textContent = err?.message || "Could not save.";
    }
}
async function fetchBookmarks() {
    const resp = await fetch(BOOKMARKS_URL);
    if (!resp.ok)
        throw new Error("Could not load bookmarks");
    return await resp.json();
}
function renderBookmarks(container, items) {
    if (!items.length) {
        container.textContent = "No saved scholarships yet.";
        return;
    }
    container.innerHTML = items
        .map((bm) => `<div style="margin-bottom:6px">
           <b>${escapeHtml(bm.title || "(untitled)")}</b><br/>
           <span style="color:#666; font-size:12px">${bm.status || "saved"}</span><br/>
           <span style="color:#888; font-size:11px">${escapeHtml(bm.url || "")}</span>
         </div>`)
        .join("");
}
async function onShowSaved() {
    const listEl = document.getElementById("saved-list");
    if (!listEl)
        return;
    listEl.textContent = "Loading…";
    try {
        const items = await fetchBookmarks();
        renderBookmarks(listEl, items);
    }
    catch (err) {
        console.error(err);
        listEl.textContent = err?.message || "Could not load saved scholarships.";
    }
}
// ---------- FOCUS MODE (circle / rect / none) ----------
async function setFocusMode(mode) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id)
        return;
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (mode) => {
            (function (mode) {
                const w = window;
                function cleanup() {
                    if (w.__adhdSpotlightEl) {
                        w.__adhdSpotlightEl.remove();
                        w.__adhdSpotlightEl = null;
                    }
                    if (w.__adhdSpotlightMoveHandler) {
                        window.removeEventListener("mousemove", w.__adhdSpotlightMoveHandler);
                        w.__adhdSpotlightMoveHandler = null;
                    }
                    if (w.__adhdSpotlightKeyHandler) {
                        window.removeEventListener("keydown", w.__adhdSpotlightKeyHandler);
                        w.__adhdSpotlightKeyHandler = null;
                    }
                    w.__adhdSpotlightMode = "none";
                }
                if (mode === "none") {
                    cleanup();
                    return;
                }
                if (!w.__adhdSpotlightEl) {
                    const sp = document.createElement("div");
                    Object.assign(sp.style, {
                        position: "fixed",
                        top: "0px",
                        left: "0px",
                        width: "0px",
                        height: "0px",
                        pointerEvents: "none",
                        zIndex: "999999999",
                        boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                        transition: "top 0.08s ease-out, left 0.08s ease-out, width 0.08s ease-out, height 0.08s ease-out",
                    });
                    document.body.appendChild(sp);
                    w.__adhdSpotlightEl = sp;
                    w.__adhdSpotlightMoveHandler = function (e) {
                        const spEl = w.__adhdSpotlightEl;
                        if (!spEl || w.__adhdSpotlightMode === "none")
                            return;
                        let width, height, radius;
                        if (w.__adhdSpotlightMode === "circle") {
                            width = height = 240;
                            radius = "50%";
                        }
                        else {
                            width = 320;
                            height = 190;
                            radius = "18px";
                        }
                        const x = e.clientX - width / 2;
                        const y = e.clientY - height / 2;
                        spEl.style.width = width + "px";
                        spEl.style.height = height + "px";
                        spEl.style.borderRadius = radius;
                        spEl.style.left = x + "px";
                        spEl.style.top = y + "px";
                    };
                    window.addEventListener("mousemove", w.__adhdSpotlightMoveHandler);
                    w.__adhdSpotlightKeyHandler = function (e) {
                        if (e.key === "Escape") {
                            cleanup();
                        }
                    };
                    window.addEventListener("keydown", w.__adhdSpotlightKeyHandler);
                }
                w.__adhdSpotlightMode = mode;
            })(mode);
        },
        args: [mode],
    });
}
// ---------- ELIGIBILITY ----------
async function requestEligibility(pageText, profile) {
    const resp = await fetch(ELIGIBILITY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            user_id: "demo-user",
            profile,
            text: pageText,
        }),
    });
    if (!resp.ok) {
        throw new Error(`Eligibility error (HTTP ${resp.status})`);
    }
    return (await resp.json());
}
function renderEligibility(container, data) {
    const icon = data.eligible ? "✅" : "❌";
    const headline = data.eligible
        ? "You appear ELIGIBLE for this scholarship."
        : "You likely are NOT eligible for this scholarship.";
    const reasonsHtml = (data.reasons || [])
        .map((r) => `<li>${escapeHtml(r)}</li>`)
        .join("");
    const missingHtml = (data.missing_info || [])
        .map((m) => `<li>${escapeHtml(m)}</li>`)
        .join("");
    container.innerHTML =
        `<div><b>${icon} ${headline}</b></div>` +
            (reasonsHtml
                ? `<div style="margin-top:4px;"><b>Why:</b><ul style="margin:4px 0 0 16px">${reasonsHtml}</ul></div>`
                : "") +
            (missingHtml
                ? `<div style="margin-top:4px;"><b>Missing / unclear:</b><ul style="margin:4px 0 0 16px">${missingHtml}</ul></div>`
                : "");
}
async function onCheckEligibility() {
    const status = document.getElementById("elig-status");
    const out = document.getElementById("elig-out");
    if (status)
        status.textContent = "Checking eligibility…";
    if (out)
        out.innerHTML = "";
    try {
        const [pageText, profile] = await Promise.all([
            captureVisibleText(),
            getProfileFromStorage(),
        ]);
        if (!profile) {
            if (status) {
                status.textContent =
                    "No profile found. Click Profile, fill it out, and save first.";
            }
            return;
        }
        const result = await requestEligibility(pageText, profile);
        if (status)
            status.textContent = "";
        if (out)
            renderEligibility(out, result);
    }
    catch (err) {
        console.error(err);
        if (status)
            status.textContent =
                err?.message || "Could not check eligibility.";
    }
}
// ---------- AUTOFILL FROM PROFILE ----------
async function autofillFormFromProfile() {
    const statusEl = document.getElementById("autofill-status");
    if (statusEl)
        statusEl.textContent = "Autofilling…";
    try {
        const profile = await getProfileFromStorage();
        if (!profile) {
            if (statusEl) {
                statusEl.textContent =
                    "No profile found. Click Profile, fill it out, and save first.";
            }
            return;
        }
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.id)
            throw new Error("No active tab");
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [profile],
            func: (profile) => {
                const lower = (s) => (s || "").toLowerCase();
                function labelTextFor(el) {
                    if (!el)
                        return "";
                    if (el.id) {
                        const byFor = document.querySelector(`label[for="${el.id}"]`);
                        if (byFor)
                            return byFor.innerText.trim();
                    }
                    const parentLabel = el.closest("label");
                    if (parentLabel)
                        return parentLabel.innerText.trim();
                    return "";
                }
                function matches(el, ...keywords) {
                    const texts = [
                        el.name,
                        el.id,
                        el.placeholder,
                        el.getAttribute("aria-label"),
                        labelTextFor(el),
                    ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();
                    return keywords.every((kw) => texts.includes(kw.toLowerCase()));
                }
                function fillText(value, ...keywords) {
                    if (!value)
                        return;
                    const inputs = Array.from(document.querySelectorAll("input[type='text'], input:not([type]), textarea"));
                    for (const el of inputs) {
                        if (matches(el, ...keywords)) {
                            el.value = value;
                            el.dispatchEvent(new Event("input", { bubbles: true }));
                            el.dispatchEvent(new Event("change", { bubbles: true }));
                            break;
                        }
                    }
                }
                // Names, email
                fillText(profile.firstName, "first", "name");
                fillText(profile.middleName, "middle", "name");
                fillText(profile.lastName, "last", "name");
                fillText(profile.email, "email");
                // Address
                fillText(profile.street1, "address");
                fillText(profile.street2, "address", "line 2");
                fillText(profile.city, "city");
                fillText(profile.province, "province");
                fillText(profile.postal, "postal");
                fillText(profile.country, "country");
                // School / program
                fillText(profile.school, "school");
                fillText(profile.school, "university");
                fillText(profile.program, "program", "study");
                fillText(profile.program, "program");
                fillText(profile.program, "field", "study");
                // Grad info
                const gradString = `${profile.gradMonth || ""} ${profile.gradYear || ""}`.trim();
                if (gradString) {
                    fillText(gradString, "graduation");
                    fillText(gradString, "expected", "completion");
                    fillText(gradString, "grad", "date");
                }
                // Canadian citizen radios
                if (profile.citizen) {
                    const radios = Array.from(document.querySelectorAll("input[type='radio']"));
                    for (const r of radios) {
                        const lbl = labelTextFor(r);
                        const lt = lbl.toLowerCase();
                        const v = (r.value || "").toLowerCase();
                        const questionText = r
                            .closest("div")
                            ?.innerText.toLowerCase() || "";
                        const mentionsCitizen = lt.includes("canadian citizen") ||
                            questionText.includes("canadian citizen");
                        if (!mentionsCitizen)
                            continue;
                        const looksLikeYes = v === "yes" ||
                            lt === "yes" ||
                            lt.includes("yes");
                        if (looksLikeYes) {
                            r.checked = true;
                            r.click();
                        }
                    }
                }
            },
        });
        if (statusEl)
            statusEl.textContent = "Autofilled basic fields ✔";
    }
    catch (err) {
        console.error("Autofill failed", err);
        if (statusEl) {
            statusEl.textContent = err?.message || "Autofill failed.";
        }
    }
}
// ---------- MAIN (wire up buttons) ----------
function main() {
    console.log("popup loaded");
    // Plan
    const planBtn = $("#plan");
    if (planBtn) {
        planBtn.addEventListener("click", onClickPlan);
    }
    // Profile
    const profileBtn = $("#open-profile");
    if (profileBtn) {
        profileBtn.addEventListener("click", () => {
            chrome.tabs.create({ url: PROFILE_PAGE_URL });
        });
    }
    // Requirements scan
    const scanBtn = document.getElementById("btn-scan");
    if (scanBtn) {
        scanBtn.addEventListener("click", async () => {
            const status = document.getElementById("req-status");
            const out = document.getElementById("req-out");
            if (status)
                status.textContent = "Capturing & parsing…";
            if (out)
                out.innerHTML = "";
            try {
                const txt = await captureVisibleText();
                const parsed = await requestParse(txt);
                if (status)
                    status.textContent = "";
                if (out)
                    renderReqs(out, parsed);
            }
            catch (err) {
                console.error(err);
                if (status)
                    status.textContent = err?.message || "Parse failed.";
            }
        });
    }
    // Save bookmark
    const saveBtn = document.getElementById("btn-save");
    if (saveBtn) {
        saveBtn.addEventListener("click", () => {
            saveCurrentPage();
        });
    }
    // Show saved bookmarks
    const showSavedBtn = document.getElementById("btn-show-saved");
    if (showSavedBtn) {
        showSavedBtn.addEventListener("click", () => {
            onShowSaved();
        });
    }
    // Eligibility
    const eligBtn = document.getElementById("btn-check-elig");
    if (eligBtn) {
        eligBtn.addEventListener("click", () => {
            onCheckEligibility();
        });
    }
    // Autofill
    const autofillBtn = document.getElementById("btn-autofill");
    if (autofillBtn) {
        autofillBtn.addEventListener("click", () => {
            autofillFormFromProfile();
        });
    }
    // Focus buttons
    const focusNone = document.getElementById("focusNone");
    if (focusNone)
        focusNone.addEventListener("click", () => setFocusMode("none"));
    const focusCircle = document.getElementById("focusCircle");
    if (focusCircle)
        focusCircle.addEventListener("click", () => setFocusMode("circle"));
    const focusRect = document.getElementById("focusRect");
    if (focusRect)
        focusRect.addEventListener("click", () => setFocusMode("rect"));
}
document.addEventListener("DOMContentLoaded", main);
// ---------- Scholarship Library (using /scholarships) ----------
(() => {
    const searchInput = document.getElementById("library-search");
    const loadBtn = document.getElementById("btn-load-library");
    const statusEl = document.getElementById("library-status");
    const listEl = document.getElementById("library-list");
    const detailEl = document.getElementById("library-detail");
    if (!loadBtn || !listEl || !detailEl || !statusEl) {
        return;
    }
    async function loadScholarships(query) {
        try {
            statusEl.textContent = "Loading scholarships...";
            listEl.innerHTML = "";
            detailEl.innerHTML = "";
            const params = new URLSearchParams();
            if (query && query.trim()) {
                params.set("q", query.trim());
            }
            const url = params.toString().length > 0
                ? `${API_BASE}/scholarships?${params.toString()}`
                : `${API_BASE}/scholarships`;
            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            if (!Array.isArray(data) || data.length === 0) {
                statusEl.textContent =
                    "No scholarships found yet. Try a different search or add more URLs.";
                return;
            }
            statusEl.textContent = `Showing ${data.length} scholarship page(s). Click one to see details.`;
            listEl.innerHTML = "";
            data.forEach((sch) => {
                const item = document.createElement("div");
                item.style.padding = "4px 0";
                item.style.borderBottom = "1px solid #eee";
                item.style.cursor = "pointer";
                const title = document.createElement("div");
                title.textContent = sch.title || "Untitled scholarship page";
                title.style.fontWeight = "600";
                title.style.fontSize = "13px";
                const meta = document.createElement("div");
                meta.textContent = sch.source_site || "";
                meta.className = "muted";
                item.appendChild(title);
                item.appendChild(meta);
                item.addEventListener("click", () => {
                    renderDetail(sch);
                });
                listEl.appendChild(item);
            });
            renderDetail(data[0]);
        }
        catch (err) {
            console.error("Error loading scholarships", err);
            statusEl.textContent =
                "Error loading scholarships. Is the backend running on http://127.0.0.1:8000?";
        }
    }
    function renderDetail(sch) {
        if (!sch) {
            detailEl.innerHTML = "";
            return;
        }
        const desc = sch.description_short || "";
        const shortened = desc.length > 600 ? desc.slice(0, 600) + "…" : desc;
        detailEl.innerHTML = `
      <div style="border-top:1px solid #eee; padding-top:6px;">
        <div style="font-weight:600; margin-bottom:4px;">
          ${sch.title || "Untitled scholarship page"}
        </div>
        <div class="muted" style="margin-bottom:4px;">
          Source: ${sch.source_site || ""}
        </div>
        <div style="margin-bottom:6px; white-space:pre-wrap;">
          ${shortened}
        </div>
        <a href="${sch.source_url}" target="_blank">
          Open official page
        </a>
      </div>
    `;
    }
    loadBtn.addEventListener("click", () => {
        const q = searchInput ? searchInput.value : "";
        loadScholarships(q);
    });
    if (searchInput) {
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                loadBtn.click();
            }
        });
    }
})();
