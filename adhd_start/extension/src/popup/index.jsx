// src/popup/index.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import PopupApp from "./PopupApp";
import "../styles/tailwind.css"; // optional if you import Tailwind from JS

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<PopupApp />);
