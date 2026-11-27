// Browser entry of the public landing page (landing.html). Never imports the app (src/main.tsx), Firebase or any
// context: src/landing/__tests__/landingBoundaries.test.ts fails if it ever does.
//
// In a production build the page arrives already rendered (scripts/landingBuild.mjs), so React only attaches to it
// (hydrateRoot). In `npm run dev` (/landing.html) the root is empty and React renders it from scratch.
import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import "./landing.css";
import LandingPage from "./LandingPage";

const root = document.getElementById("landing-root")!;
const page = (
  <StrictMode>
    <LandingPage />
  </StrictMode>
);

if (root.firstElementChild) hydrateRoot(root, page);
else createRoot(root).render(page);
