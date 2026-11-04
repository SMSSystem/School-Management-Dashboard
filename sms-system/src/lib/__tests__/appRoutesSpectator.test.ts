import { describe, expect, it } from "vitest";
import { appSource as app, routingFile } from "./appSource";

// Route guards live in App.tsx as inline expressions, so this test reads the
// file as text (like spectatorRules.test.ts reads firestore.rules). It pins which
// routes admit a spectator and which keep redirecting it
// (docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md, section 7.2 "Routes").

// The JSX of one <Route path="..."> element, up to the next <Route.
function routeBlock(path: string): string {
  const at = app.indexOf(`path="${path}"`);
  expect(at, `no route for ${path}`).toBeGreaterThan(-1);
  const next = app.indexOf("<Route", at + 1);
  return app.slice(at, next === -1 ? undefined : next);
}

// A guard admits a spectator if it uses a capability that includes the role or
// names the role itself.
const admitsSpectator = (block: string) =>
  /hasAdminView\(role\)|hasStaffView\(role\)|canOpenRubrics\(role\)|role === "spectator"|"spectator",/.test(
    block,
  );

describe("routes that admit a spectator (read views)", () => {
  const ADMITTING = [
    "/dashboard/list/subjects/:id",
    "/dashboard/list/classes/:id",
    "/dashboard/list/terms/:id",
    "/dashboard/list/rubrics",
    "/dashboard/list/lesson-notes",
    "/dashboard/list/gradebook",
    "/dashboard/list/houses",
    "/dashboard/list/houses/:id",
    "/dashboard/report-card-comments",
    "/dashboard/registrations",
    "/dashboard/reports/builder",
    "/dashboard/admin/audit-log",
    "/dashboard/academic-calendar",
    "/dashboard/attendance/general",
    "/dashboard/attendance/subject",
    "/dashboard/attendance/gridsheet",
    "/dashboard/admin/grade-entry-tracking",
    "/dashboard/institution-profile",
  ];
  it.each(ADMITTING)("%s", (path) => {
    expect(admitsSpectator(routeBlock(path)), path).toBe(true);
  });
});

describe("routes that keep redirecting a spectator (write tools and others)", () => {
  const REDIRECTING = [
    "/dashboard/create-user",
    "/dashboard/list/spectators",
    "/dashboard/import",
    "/dashboard/admin/backfill-student-classes",
    "/dashboard/admin/rebuild-attendance-summaries",
    "/dashboard/brand-settings",
    "/dashboard/onboard-institution",
    "/dashboard/manage-admins",
    "/dashboard/attendance/my",
    "/dashboard/attendance/child",
  ];
  it.each(REDIRECTING)("%s", (path) => {
    expect(admitsSpectator(routeBlock(path)), path).toBe(false);
  });
});

describe("settings page", () => {
  const block = routeBlock("/dashboard/settings");

  it("sends a spectator home, because the page saves institution fields", () => {
    expect(block).toMatch(
      /role === "spectator" \? \(\s*<Navigate to="\/dashboard" replace \/>/,
    );
  });

  it("still shows the page to every other role", () => {
    expect(block).toContain("<SettingsPage />");
    expect(block).not.toMatch(/hasAdminView|hasStaffView|institution_admin/);
  });
});

describe("dashboard home", () => {
  const home = routingFile("routes/dashboardHome.tsx");

  it("gives a spectator its own read-only home", () => {
    expect(home).toContain('role === "spectator" ? (');
    expect(home).toContain("<SpectatorPage />");
  });

  it("no longer falls through to the admin dashboard for an unrecognised role", () => {
    const fallback = home.slice(home.lastIndexOf(") : ("));
    expect(fallback).toContain("<NoAccessPage />");
    expect(fallback).not.toContain("<AdminPage />");
    // AdminPage is still the institution admin's own home.
    expect(home).toContain(
      'role === "institution_admin" ? (\n      <AdminPage />',
    );
  });
});
