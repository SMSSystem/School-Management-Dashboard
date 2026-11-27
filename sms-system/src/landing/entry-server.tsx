// Build-time entry of the public landing page: scripts/landingBuild.mjs loads this on the build machine and puts the
// HTML into landing.html, so the page is complete before any JavaScript runs (readable with JavaScript off, quick to
// show). The same component renders in the browser (main.tsx), which must produce identical HTML on its first render.
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import LandingPage from "./LandingPage";

export function render(): string {
  return renderToString(
    <StrictMode>
      <LandingPage />
    </StrictMode>,
  );
}
