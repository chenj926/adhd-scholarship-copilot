import React from "react";
import { createRoot } from "react-dom/client";
import PopupApp from "./PopupApp";
// Import global tailwind styles here so they are bundled
import "../../styles/tailwind.css"; 

const container = document.getElementById("root");
const root = createRoot(container);
root.render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);