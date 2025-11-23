// src/profile/ProfilePage.jsx
/* global chrome */

import React, { useEffect, useState } from "react";

const emptyRef = { firstName: "", lastName: "", title: "", letter: "" };

const emptyProfile = {
  firstName: "",
  middleName: "",
  lastName: "",
  email: "",
  street1: "",
  street2: "",
  city: "",
  province: "",
  postalCode: "",
  country: "",
  citizen: false,
  pr: false,
  otherStatus: false,
  school: "",
  program: "",
  yearsCompleted: "",
  expectedCompletion: "",
  degreeType: "",
  resumeSummary: "",
  references: [ { ...emptyRef }, { ...emptyRef }, { ...emptyRef } ],
};

export default function ProfilePage() {
  const [profile, setProfile] = useState(emptyProfile);
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState("info"); // "info" | "success" | "error"
  const STORAGE_KEY = "userProfile";

  useEffect(() => {
    async function load() {
      try {
        setStatus("Loading profile…");
        setStatusKind("info");
        chrome.storage.sync.get(STORAGE_KEY, (stored) => {
          const data = stored[STORAGE_KEY] || {};
          const refs = data.references || [];
          const normalizedRefs = [0, 1, 2].map((i) => ({
            ...emptyRef,
            ...(refs[i] || {}),
          }));
          setProfile({
            ...emptyProfile,
            ...data,
            references: normalizedRefs,
          });
          setStatus("");
        });
      } catch (err) {
        console.error("Failed to load profile", err);
        setStatus("Could not load saved profile.");
        setStatusKind("error");
      }
    }
    load();
  }, []);

  function setField(field, value) {
    setProfile((p) => ({ ...p, [field]: value }));
  }

  function setRefField(index, field, value) {
    setProfile((p) => {
      const refs = [...p.references];
      const current = refs[index] || { ...emptyRef };
      refs[index] = { ...current, [field]: value };
      return { ...p, references: refs };
    });
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      setStatus("Saving profile…");
      setStatusKind("info");

      const toStore = { ...profile };
      chrome.storage.sync.set({ [STORAGE_KEY]: toStore }, () => {
        chrome.runtime.sendMessage({
          type: "PROFILE_UPDATED",
          profile: toStore,
        });
        setStatus("Profile saved.");
        setStatusKind("success");
      });
    } catch (err) {
      console.error("Failed to save profile", err);
      setStatus("Could not save profile.");
      setStatusKind("error");
    }
  }

  async function handleClear() {
    const confirmed = window.confirm(
      "Are you sure you want to clear your saved profile? This cannot be undone."
    );
    if (!confirmed) {
      setStatus("Profile not cleared.");
      setStatusKind("info");
      return;
    }

    try {
      chrome.storage.sync.remove(STORAGE_KEY, () => {
        chrome.runtime.sendMessage({
          type: "PROFILE_UPDATED",
          profile: null,
        });
        setProfile(emptyProfile);
        setStatus("Saved profile cleared.");
        setStatusKind("success");
      });
    } catch (err) {
      console.error("Failed to clear profile", err);
      setStatus("Error clearing profile.");
      setStatusKind("error");
    }
  }

  const statusClasses =
    statusKind === "success"
      ? "text-emerald-400"
      : statusKind === "error"
      ? "text-red-400"
      : "text-slate-400";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex justify-center px-4 py-6">
      <div className="w-full max-w-3xl space-y-4">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold">Profile</h1>
          <p className="text-sm text-slate-400">
            This information stays on your device and is used to auto-fill
            applications.
          </p>
        </header>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Basic Information */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <h2 className="text-sm font-semibold">Basic Information</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <Field
                label="First name"
                required
                value={profile.firstName}
                onChange={(v) => setField("firstName", v)}
              />
              <Field
                label="Middle name (optional)"
                value={profile.middleName}
                onChange={(v) => setField("middleName", v)}
              />
              <Field
                label="Last name"
                required
                value={profile.lastName}
                onChange={(v) => setField("lastName", v)}
              />
            </div>
            <Field
              label="Email"
              required
              type="email"
              value={profile.email}
              onChange={(v) => setField("email", v)}
            />
          </section>

          {/* Address */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <h2 className="text-sm font-semibold">Address</h2>
            <Field
              label="Street address 1"
              required
              value={profile.street1}
              onChange={(v) => setField("street1", v)}
            />
            <Field
              label="Street address 2 (optional)"
              value={profile.street2}
              onChange={(v) => setField("street2", v)}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="City"
                required
                value={profile.city}
                onChange={(v) => setField("city", v)}
              />
              <Field
                label="Province / State"
                required
                value={profile.province}
                onChange={(v) => setField("province", v)}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Postal code"
                required
                value={profile.postalCode}
                onChange={(v) => setField("postalCode", v)}
              />
              <Field
                label="Country"
                required
                value={profile.country}
                onChange={(v) => setField("country", v)}
              />
            </div>
          </section>

          {/* Residency Status */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <h2 className="text-sm font-semibold">Residency Status</h2>
            <p className="text-xs text-slate-400">
              Check all that apply (Used for eligibility checks).
            </p>
            <div className="grid gap-2 md:grid-cols-3">
              <Checkbox
                label="Canadian citizen"
                checked={profile.citizen}
                onChange={(v) => setField("citizen", v)}
              />
              <Checkbox
                label="Canada PR"
                checked={profile.pr}
                onChange={(v) => setField("pr", v)}
              />
              <Checkbox
                label="Other / international"
                checked={profile.otherStatus}
                onChange={(v) => setField("otherStatus", v)}
              />
            </div>
          </section>

          {/* Education */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <h2 className="text-sm font-semibold">Education</h2>
            <Field
              label="School"
              required
              value={profile.school}
              onChange={(v) => setField("school", v)}
            />
            <Field
              label="Program of study"
              required
              value={profile.program}
              onChange={(v) => setField("program", v)}
            />
            <div className="grid gap-3 md:grid-cols-3">
              <Field
                label="Years completed"
                required
                type="number"
                value={profile.yearsCompleted}
                onChange={(v) => setField("yearsCompleted", v)}
              />
              <SelectField
                label="Degree type"
                value={profile.degreeType}
                onChange={(v) => setField("degreeType", v)}
                options={[
                  { value: "", label: "Select…" },
                  { value: "undergrad", label: "Undergraduate / Bachelor" },
                  { value: "masters", label: "Master's" },
                  { value: "phd", label: "PhD" },
                  { value: "college", label: "College / Diploma" },
                  { value: "other", label: "Other" },
                ]}
              />
              <Field
                label="Expected date of completion"
                required
                type="date"
                value={profile.expectedCompletion}
                onChange={(v) => setField("expectedCompletion", v)}
              />
            </div>
          </section>

          {/* Resume */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
            <h2 className="text-sm font-semibold">Resume</h2>
            <p className="text-xs text-slate-400">
              Summarize your key activities.
            </p>
            <TextareaField
              label="Activity Summary"
              rows={6}
              value={profile.resumeSummary}
              onChange={(v) => setField("resumeSummary", v)}
              placeholder="E.g. leadership roles, internships, projects, volunteering, awards..."
            />
          </section>

          {/* References */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-4">
            <h2 className="text-sm font-semibold">References</h2>
            <p className="text-xs text-slate-400">Up to 3 references.</p>

            {[0, 1, 2].map((i) => {
              const ref = profile.references[i] || emptyRef;
              return (
                <div key={i} className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-300">
                    Reference {i + 1}
                  </h3>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Field
                      label="First name"
                      value={ref.firstName}
                      onChange={(v) =>
                        setRefField(i, "firstName", v)
                      }
                    />
                    <Field
                      label="Last name"
                      value={ref.lastName}
                      onChange={(v) =>
                        setRefField(i, "lastName", v)
                      }
                    />
                    <Field
                      label="Title / Relationship"
                      value={ref.title}
                      onChange={(v) => setRefField(i, "title", v)}
                    />
                  </div>
                  <TextareaField
                    label="Supporting letter / notes / URL"
                    rows={3}
                    value={ref.letter}
                    onChange={(v) => setRefField(i, "letter", v)}
                  />
                </div>
              );
            })}
          </section>

          {/* Actions */}
          <section className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-blue-500 px-4 py-2 text-[13px] font-semibold text-slate-950 hover:bg-blue-400 transition"
            >
              Save profile
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-[13px] text-slate-200 hover:bg-slate-800 transition"
            >
              Clear saved data
            </button>
            <span className={`text-xs ${statusClasses}`} aria-live="polite">
              {status}
            </span>
          </section>
        </form>
      </div>
    </main>
  );
}

function Field({ label, required, type = "text", value, onChange }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-200">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

function TextareaField({ label, rows = 3, value, onChange, placeholder }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-200">{label}</label>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[12px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-950 text-blue-500 focus:ring-blue-500"
      />
      <span>{label}</span>
    </label>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-200">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[12px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {options.map((opt) => (
          <option key={opt.value || "_blank"} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
