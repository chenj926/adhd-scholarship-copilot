import React from 'react';
import { createRoot } from 'react-dom/client';
import OverlayApp from './OverlayApp';
import '../styles/tailwind.css';

// Ensure unique ID for the host to prevent collisions
const HOST_ID = "adhd-copilot-overlay-root";

function initOverlay() {
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.top = "0";
    host.style.left = "0";
    host.style.width = "0";
    host.style.height = "0";
    document.documentElement.appendChild(host);
  }

  // Use shadow DOM to isolate styles
  let shadow = host.shadowRoot;
  if (!shadow) {
    shadow = host.attachShadow({ mode: 'open' });
  }

  // We need to inject the Tailwind styles into the Shadow DOM
  // In production build, Vite will put css in assets. We need to find it.
  // Since we are in a content script, we can't easily link standard stylesheets.
  // STRATEGY: We will mount the app, and the component imports CSS. 
  // Vite will bundle the CSS. We need to make sure that CSS applies inside Shadow DOM.
  // The `style-loader` or similar mechanisms usually put style tags in head. 
  // For Shadow DOM, we need to manually insert the style tag.
  
  // NOTE: For this hackathon/demo setup with standard Vite, styling Shadow DOM 
  // from a content script is tricky. 
  // Simplest fix: We will mount the Root into a div, and let `OverlayApp` handle 
  // injecting a <style> tag with the compiled CSS text if possible, 
  // OR easier: Don't use Shadow DOM for the styles, just use specific prefixes.
  // BUT the user asked for React.
  
  // Let's try standard mounting. The `import '../styles/tailwind.css'` in OverlayApp 
  // might inject into the main document <head>. That works for the overlay if we 
  // use high z-index, but Shadow DOM is better for isolation.
  
  // For simplicity and robustness in this refactor: We will use the Shadow Root, 
  // and we will fetch the CSS file from the extension bundle and inject it.
  
  const rootEl = document.createElement('div');
  shadow.appendChild(rootEl);
  
  const root = createRoot(rootEl);
  root.render(
    <React.StrictMode>
      {/* Inject Stylesheet link pointing to the extension's CSS resource */}
      <link rel="stylesheet" href={chrome.runtime.getURL("assets/style.css")} />
      <OverlayApp />
    </React.StrictMode>
  );
}

// Prevent double init
if (!window.__adhdOverlayInited) {
  window.__adhdOverlayInited = true;
  // Wait for DOM
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOverlay);
  } else {
    initOverlay();
  }
}
