// The home page and the routes every role shares or that do not belong to one area: import, registrations, audit log, branding, profile, settings, events, announcements, departments, and the redirects.
// Each route keeps its own role rule next to it. App.tsx puts the result inside <Routes>, which
// only accepts <Route> elements or a fragment of them, so this is a function, not a component.

import { Navigate, Route } from "react-router-dom";
import type { Role } from "@/lib/firebase";
import { hasAdminView } from "@/lib/roleCapabilities";
import { homeFor } from "@/routes/dashboardHome";
import {
  EventListPage,
  AnnouncementListPage,
  DepartmentListPage,
  ImportPage,
  RegistrationReviewPage,
  AuditLogPage,
  BrandSettingsPage,
  InstitutionProfilePage,
  ProfilePage,
  SettingsPage,
} from "@/routes/lazyPages";

export function generalRoutes(role: Role | null) {
  return (
    <>
      <Route
        path="/"
        element={<Navigate to="/dashboard" replace />}
      />
      <Route path="/dashboard" element={homeFor(role)} />
      <Route
        path="/dashboard/list/events"
        element={<EventListPage />}
      />
      <Route
        path="/dashboard/list/announcements"
        element={<AnnouncementListPage />}
      />
      <Route
        path="/dashboard/list/departments"
        element={<DepartmentListPage />}
      />
      <Route
        path="/dashboard/import"
        element={
          role === "super_admin" ||
          role === "institution_admin" ||
          role === "senior_teacher" ||
          role === "regular_teacher" ? (
            <ImportPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/registrations"
        element={
          hasAdminView(role) ? (
            <RegistrationReviewPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/admin/audit-log"
        element={
          hasAdminView(role) ? (
            <AuditLogPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/brand-settings"
        element={
          role === "super_admin" || role === "institution_admin" ? (
            <BrandSettingsPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/institution-profile"
        element={
          [
            "institution_admin",
            "spectator",
            "senior_teacher",
            "regular_teacher",
            "student",
            "parent",
          ].includes(role ?? "") ? (
            <InstitutionProfilePage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route path="/dashboard/profile" element={<ProfilePage />} />
      {/* The Settings page saves institution fields (grading system,
          grade tracking), so a spectator is sent home. Every other
          role keeps its existing access. */}
      <Route
        path="/dashboard/settings"
        element={
          role === "spectator" ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <SettingsPage />
          )
        }
      />
      <Route
        path="*"
        element={<Navigate to="/dashboard" replace />}
      />
    </>
  );
}
