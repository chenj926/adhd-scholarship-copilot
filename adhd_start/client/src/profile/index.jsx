import React from "react";
import { createRoot } from "react-dom/client";
import ProfilePage from "./ProfilePage";
// FIX: Use single dot dot (..) to go up to 'src/'
import "../styles/tailwind.css"; 

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ProfilePage />
  </React.StrictMode>
);