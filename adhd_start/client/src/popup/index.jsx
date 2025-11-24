import React from "react";
import { createRoot } from "react-dom/client";
import PopupApp from "./PopupApp";
// FIX: Use single dot dot (..) to go up to 'src/'
import "../styles/tailwind.css"; 

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);