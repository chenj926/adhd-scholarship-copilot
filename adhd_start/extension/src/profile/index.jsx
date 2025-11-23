// src/profile/index.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import ProfilePage from "./ProfilePage";
import "../styles/tailwind.css";

const root = createRoot(document.getElementById("root"));
root.render(<ProfilePage />);
