import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Suspense } from "react";
import PageErrorBoundary from "@/components/PageErrorBoundary";
import RouteFallback from "@/components/RouteFallback";
import PostLoginInstitutionGate from "@/components/PostLoginInstitutionGate";
import { useAuth } from "@/lib/AuthContext";
import { RegistrationInstitutionPickerPage, StudentRegistrationFormPage } from "@/routes/lazyPages";

/** The sign-in and student-registration screens, shown outside the dashboard shell. */
export default function AuthRoutes() {
  const location = useLocation();
  const { user, loading } = useAuth();
  // The register pages are loaded on demand: if their code cannot be fetched, show the error
  // card with a Reload button instead of a blank screen.
  return (
    <PageErrorBoundary resetKey={location.key}>
      <Suspense fallback={<RouteFallback fullScreen />}>
        <Routes>
          <Route path="/login" element={<PostLoginInstitutionGate />} />
          {/* First-login email link: institution + role code as path segments. */}
          <Route path="/login/:institutionId/:role" element={<PostLoginInstitutionGate />} />
          <Route
            path="/register"
            element={
              !loading && user ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <RegistrationInstitutionPickerPage />
              )
            }
          />
          <Route
            path="/register/:institutionId"
            element={
              !loading && user ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <StudentRegistrationFormPage />
              )
            }
          />
        </Routes>
      </Suspense>
    </PageErrorBoundary>
  );
}
