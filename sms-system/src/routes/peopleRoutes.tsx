// Routes for people: teachers, students, parents, spectators, and the pages that create or manage accounts.
// Each route keeps its own role rule next to it. App.tsx puts the result inside <Routes>, which
// only accepts <Route> elements or a fragment of them, so this is a function, not a component.

import { Navigate, Route } from "react-router-dom";
import type { Role } from "@/lib/firebase";
import { canManage } from "@/lib/roleCapabilities";
import {
  TeacherListPage,
  SingleTeacherPage,
  StudentListPage,
  SingleStudentPage,
  ParentListPage,
  SpectatorListPage,
  SuperAdminCreateUserPage,
  OnboardInstitutionPage,
  ManageAdminsPage,
} from "@/routes/lazyPages";

export function peopleRoutes(role: Role | null) {
  return (
    <>
      <Route
        path="/dashboard/list/teachers"
        element={<TeacherListPage />}
      />
      <Route
        path="/dashboard/list/teachers/:id"
        element={<SingleTeacherPage />}
      />
      <Route
        path="/dashboard/list/students"
        element={<StudentListPage />}
      />
      <Route
        path="/dashboard/list/students/:id"
        element={<SingleStudentPage />}
      />
      <Route
        path="/dashboard/list/parents"
        element={<ParentListPage />}
      />
      {/* Managing spectator accounts is an admin job; a spectator is
          redirected. */}
      <Route
        path="/dashboard/list/spectators"
        element={
          canManage(role) ? (
            <SpectatorListPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/create-user"
        element={
          role === "super_admin" || role === "institution_admin" ? (
            <SuperAdminCreateUserPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/onboard-institution"
        element={
          role === "super_admin" ? (
            <OnboardInstitutionPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/manage-admins"
        element={
          role === "super_admin" ? (
            <ManageAdminsPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
    </>
  );
}
