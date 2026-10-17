// Routes for attendance, and the two admin tools that rebuild attendance data.
// Each route keeps its own role rule next to it. App.tsx puts the result inside <Routes>, which
// only accepts <Route> elements or a fragment of them, so this is a function, not a component.

import { Navigate, Route } from "react-router-dom";
import type { Role } from "@/lib/firebase";
import { hasAdminView } from "@/lib/roleCapabilities";
import {
  GeneralAttendanceRegisterPage,
  MyAttendancePage,
  ChildAttendancePage,
  SubjectAttendancePage,
  AttendanceGridsheetPage,
  BackfillStudentClassesPage,
  RebuildAttendanceSummariesPage,
} from "@/routes/lazyPages";

export function attendanceRoutes(role: Role | null) {
  return (
    <>
      <Route
        path="/dashboard/attendance/general"
        element={
          hasAdminView(role) ||
          role === "senior_teacher" ? (
            <GeneralAttendanceRegisterPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/attendance/my"
        element={
          role === "student" ? (
            <MyAttendancePage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/attendance/child"
        element={
          role === "parent" ? (
            <ChildAttendancePage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/attendance/subject"
        element={
          hasAdminView(role) ||
          role === "regular_teacher" ? (
            <SubjectAttendancePage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/attendance/gridsheet"
        element={
          hasAdminView(role) ||
          role === "senior_teacher" ? (
            <AttendanceGridsheetPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/admin/backfill-student-classes"
        element={
          role === "super_admin" || role === "institution_admin" ? (
            <BackfillStudentClassesPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
      <Route
        path="/dashboard/admin/rebuild-attendance-summaries"
        element={
          role === "institution_admin" ? (
            <RebuildAttendanceSummariesPage />
          ) : (
            <Navigate to="/dashboard" replace />
          )
        }
      />
    </>
  );
}
