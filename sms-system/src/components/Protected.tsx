import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import ChangePasswordPage from "@/scenes/(auth)/change-password";
import InactivityGuard from "@/components/InactivityGuard";
import IdleLockGate from "@/components/IdleLockGate";

const CHANGE_PASSWORD_PATH = "/change-password";

export default function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading, mustChangePassword, offlineStart } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Signed in, but the profile couldn't be read because the device is offline, and this tab has no working copy of it
  // (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md). AuthContext tries again when the connection returns.
  if (offlineStart === "blocked") {
    return (
      <div
        role="status"
        className="min-h-screen flex items-center justify-center p-6"
      >
        <div className="max-w-md text-center space-y-2">
          <h1 className="text-lg font-semibold">Can't reach the server</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            You're still signed in, and nothing on this device has been lost.
            This page will carry on by itself when the connection returns.
          </p>
        </div>
      </div>
    );
  }

  // Renders ChangePasswordPage directly rather than routing to it through
  // `children` (App.tsx's dashboard route tree) — `children` is wrapped in
  // DashboardLayout (sidebar + top header), which this full-screen gate
  // deliberately doesn't want, the same way /login isn't wrapped in it
  // either. No matching <Route> exists for CHANGE_PASSWORD_PATH inside that
  // tree on purpose: this page is reachable only through this flag, not as
  // a general destination. The one-time Navigate below just normalizes the
  // URL bar to something bookmarkable/refreshable before rendering it. See
  // docs/miscellaneous-specs/SPREADSHEET_IMPORT_STUDENTS_SPEC.md Part B.
  if (mustChangePassword) {
    if (location.pathname !== CHANGE_PASSWORD_PATH) {
      return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
    }
    return (
      <>
        <InactivityGuard />
        <ChangePasswordPage />
      </>
    );
  }

  // The offline idle lock (slice D) replaces the whole dashboard while this tab is locked.
  return <IdleLockGate>{children}</IdleLockGate>;
}
