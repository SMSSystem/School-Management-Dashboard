// The page shown at /dashboard: each role has its own home.
import type { Role } from "@/lib/firebase";
import NoAccessPage from "@/components/NoAccessPage";
import {
  AdminPage,
  SpectatorPage,
  SuperAdminPage,
  SeniorTeacherPage,
  RegularTeacherPage,
  StudentPage,
  ParentPage,
} from "@/routes/lazyPages";

export function homeFor(role: Role | null) {
  return (
    role === "super_admin" ? (
      <SuperAdminPage />
    ) : role === "institution_admin" ? (
      <AdminPage />
    ) : role === "spectator" ? (
      <SpectatorPage />
    ) : role === "senior_teacher" ? (
      <SeniorTeacherPage />
    ) : role === "regular_teacher" ? (
      <RegularTeacherPage />
    ) : role === "student" ? (
      <StudentPage />
    ) : role === "parent" ? (
      <ParentPage />
    ) : (
      // An unrecognised role must not fall through to the admin dashboard.
      <NoAccessPage />
    )
  );
}
