"use strict";

const $ = (sel) => document.querySelector(sel);

document.addEventListener("DOMContentLoaded", () => {
  const nameInput = $("#name");
  const emailInput = $("#email");
  const resumeInput = $("#resumeUrl");
  const form = $("#profile-form");
  const statusEl = $("#status");
  const clearBtn = $("#clear-btn");

  // Load existing profile data
  chrome.storage.sync.get(["profile"], (data) => {
    const profile = data.profile || {};
    if (profile.name) nameInput.value = profile.name;
    if (profile.email) emailInput.value = profile.email;
    if (profile.resumeUrl) resumeInput.value = profile.resumeUrl;
  });

  // Save on submit
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const profile = {
      name: nameInput.value.trim(),
      email: emailInput.value.trim(),
      resumeUrl: resumeInput.value.trim(),
    };

    chrome.storage.sync.set({ profile }, () => {
      statusEl.textContent = "Profile saved!";
      setTimeout(() => {
        statusEl.textContent = "";
      }, 2000);
    });
  });

  // Clear / delete profile
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const sure = confirm("Clear your saved profile from this extension?");
      if (!sure) return;

      chrome.storage.sync.remove("profile", () => {
        // Clear the form fields in the UI
        nameInput.value = "";
        emailInput.value = "";
        resumeInput.value = "";

        statusEl.textContent = "Profile cleared.";
        setTimeout(() => {
          statusEl.textContent = "";
        }, 2000);
      });
    });
  }
});
