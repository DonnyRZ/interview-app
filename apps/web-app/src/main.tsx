import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WebMeetingApp } from "./app/WebMeetingApp.js";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <WebMeetingApp />
  </StrictMode>
);
