(() => {
  // Prevent multiple overlays if the user toggles on/off
  if (window.__spotlight_active) return;
  window.__spotlight_active = true;

  // === CREATE OVERLAY ===
  const overlay = document.createElement("div");
  overlay.id = "adhd-spotlight-overlay";
  Object.assign(overlay.style, {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "100vh",
    background: "rgba(0,0,0,0.55)",
    pointerEvents: "none",
    zIndex: 999999999,
    transition: "clip-path 0.12s ease-out",
  });
  document.body.appendChild(overlay);

  // === UPDATE SPOTLIGHT REGION ===
  function updateSpotlight(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;

    const rect = el.getBoundingClientRect();

    const padding = 8;
    const top = rect.top - padding;
    const left = rect.left - padding;
    const width = rect.width + padding * 2;
    const height = rect.height + padding * 2;

    // Use CSS clip-path "hole" to reveal element
    overlay.style.clipPath = `polygon(
      0% 0%,
      100% 0%,
      100% 100%,
      0% 100%,
      0% 0%,
      ${left}px ${top}px,
      ${left + width}px ${top}px,
      ${left + width}px ${top + height}px,
      ${left}px ${top + height}px,
      ${left}px ${top}px
    )`;
  }

  window.addEventListener("mousemove", updateSpotlight);

  // === EXIT MODE ===
  function exitSpotlight() {
    overlay.remove();
    window.removeEventListener("mousemove", updateSpotlight);
    window.removeEventListener("keydown", onKey);
    window.__spotlight_active = false;
  }

  function onKey(e) {
    if (e.key === "Escape") exitSpotlight();
  }

  window.addEventListener("keydown", onKey);

  // Optional: Exit on click, if desired
  overlay.addEventListener("click", exitSpotlight);
})();
