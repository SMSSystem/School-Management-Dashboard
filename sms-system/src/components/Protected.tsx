import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

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

  // The change-password route's own content lives inside `children` (the
  // dashboard route tree), same as every other page — without this
  // exemption, a flagged account landing on /change-password would be
  // bounced straight back to itself by the check below, with no way to
  // ever reach the form that clears the flag. See
  // docs/miscellaneous-specs/SPREADSHEET_IMPORT_STUDENTS_SPEC.md Part B.
  if (mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }

  return <>{children}</>;
}
