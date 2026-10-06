import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { CoachApi } from "../preload/index";
import { App } from "./App";
// Fonts are bundled (SIL Open Font License): the CSP allows no outside font hosts.
import "@fontsource/barlow/400.css";
import "@fontsource/barlow/500.css";
import "@fontsource/barlow/600.css";
import "@fontsource/barlow-semi-condensed/500.css";
import "@fontsource/barlow-semi-condensed/600.css";
import "@fontsource/barlow-semi-condensed/700.css";
import "./styles.css";

declare global {
  interface Window {
    coach: CoachApi;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
