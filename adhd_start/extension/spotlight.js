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
  const x = e.clientX;
  const y = e.clientY;
  const radius = 140;   // spotlight size

  overlay.style.background = `
    radial-gradient(
      circle ${radius}px at ${x}px ${y}px,
      rgba(0,0,0,0) 0%,
      rgba(0,0,0,0) 60%,
      rgba(0,0,0,0.55) 100%
    )
  `;
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
