import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import ChangePasswordPage from '@/scenes/(auth)/change-password';
import InactivityGuard from '@/components/InactivityGuard';

const CHANGE_PASSWORD_PATH = '/change-password';

export default function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading, mustChangePassword } = useAuth();
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

  return <>{children}</>;
}
