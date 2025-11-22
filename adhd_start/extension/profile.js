/* global chrome */

const form = document.getElementById("profile-form");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");

const STORAGE_KEY = "userProfile";

function setStatus(message, kind = "info") {
  statusEl.textContent = message || "";
  statusEl.classList.remove("status--success", "status--error");
  if (kind === "success") statusEl.classList.add("status--success");
  if (kind === "error") statusEl.classList.add("status--error");
}

// Read all fields from the form into a structured profile object
function readForm() {
  return {
    firstName: form.firstName.value.trim(),
    middleName: form.middleName.value.trim(),
    lastName: form.lastName.value.trim(),
    email: form.email.value.trim(),

    street1: form.street1.value.trim(),
    street2: form.street2.value.trim(),
    city: form.city.value.trim(),
    province: form.province.value.trim(),
    postalCode: form.postalCode.value.trim(),
    country: form.country.value.trim(),

    citizen: form.citizen.checked,
    pr: form.pr.checked,
    otherStatus: form.otherStatus.checked,

    school: form.school.value.trim(),
    program: form.program.value.trim(),
    yearsCompleted: form.yearsCompleted.value,
    expectedCompletion: form.expectedCompletion.value,

    // Free-form resume summary
    resumeSummary: form.resumeSummary.value.trim(),

    references: [
      {
        firstName: form.ref1First.value.trim(),
        lastName: form.ref1Last.value.trim(),
        title: form.ref1Title.value.trim(),
        letter: form.ref1Letter.value.trim(),
      },
      {
        firstName: form.ref2First.value.trim(),
        lastName: form.ref2Last.value.trim(),
        title: form.ref2Title.value.trim(),
        letter: form.ref2Letter.value.trim(),
      },
      {
        firstName: form.ref3First.value.trim(),
        lastName: form.ref3Last.value.trim(),
        title: form.ref3Title.value.trim(),
        letter: form.ref3Letter.value.trim(),
      },
    ],
  };
}

// Write profile data back into the form fields
function writeForm(data = {}) {
  form.firstName.value = data.firstName || "";
  form.middleName.value = data.middleName || "";
  form.lastName.value = data.lastName || "";
  form.email.value = data.email || "";

  form.street1.value = data.street1 || "";
  form.street2.value = data.street2 || "";
  form.city.value = data.city || "";
  form.province.value = data.province || "";
  form.postalCode.value = data.postalCode || "";
  form.country.value = data.country || "";

  form.citizen.checked = Boolean(data.citizen);
  form.pr.checked = Boolean(data.pr);
  form.otherStatus.checked = Boolean(data.otherStatus);

  form.school.value = data.school || "";
  form.program.value = data.program || "";
  form.yearsCompleted.value = data.yearsCompleted || "";
  form.expectedCompletion.value = data.expectedCompletion || "";

  form.resumeSummary.value = data.resumeSummary || "";

  const refs = data.references || [];
  const [r1, r2, r3] = [refs[0] || {}, refs[1] || {}, refs[2] || {}];

  form.ref1First.value = r1.firstName || "";
  form.ref1Last.value = r1.lastName || "";
  form.ref1Title.value = r1.title || "";
  form.ref1Letter.value = r1.letter || "";

  form.ref2First.value = r2.firstName || "";
  form.ref2Last.value = r2.lastName || "";
  form.ref2Title.value = r2.title || "";
  form.ref2Letter.value = r2.letter || "";

  form.ref3First.value = r3.firstName || "";
  form.ref3Last.value = r3.lastName || "";
  form.ref3Title.value = r3.title || "";
  form.ref3Letter.value = r3.letter || "";
}

async function loadProfile() {
  try {
    setStatus("Loading profile…");
    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    writeForm(stored[STORAGE_KEY] || {});
    setStatus("");
  } catch (err) {
    console.error("Failed to load profile", err);
    setStatus("Could not load saved profile.", "error");
  }
}

async function saveProfile(event) {
  event.preventDefault(); // stay on this page instead of reloading

  try {
    const profile = readForm();
    setStatus("Saving profile…");

    await chrome.storage.sync.set({ [STORAGE_KEY]: profile });

    // Notify the extension (popup) that profile has been updated
    chrome.runtime.sendMessage({ type: "PROFILE_UPDATED", profile });

    setStatus("Profile saved.", "success");
  } catch (err) {
    console.error("Failed to save profile", err);
    setStatus("Could not save profile.", "error");
  }
}

async function clearProfile() {
  const confirmed = confirm(
    "Are you sure you want to clear your saved profile? This cannot be undone."
  );
  if (!confirmed) {
    setStatus("Profile not cleared.");
    return;
  }

  try {
    await chrome.storage.sync.remove(STORAGE_KEY);
    writeForm({});
    setStatus("Saved profile cleared.", "success");
  } catch (err) {
    console.error("Failed to clear profile", err);
    setStatus("Error clearing profile.", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadProfile();
  form.addEventListener("submit", saveProfile);
  resetBtn.addEventListener("click", clearProfile);
});
