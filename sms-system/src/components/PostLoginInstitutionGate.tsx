import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  consumePendingLoginInstitution,
  doesInstitutionMatch,
} from "@/lib/pendingLoginInstitution";
import LoginPage from "@/scenes/(auth)/login";

const MISMATCH_ERROR =
  "This account doesn't belong to the selected institution. Select the correct institution and try again.";

/**
 * Replaces a plain `!loading && user ? <Navigate to="/dashboard" /> : <LoginPage />`
 * at the /login route. The extra step: if a login attempt just wrote a
 * pending institution selection (LoginFormView, right before calling
 * signIn()), compare it against the now-resolved institutionId before
 * allowing the transition to /dashboard, and sign back out on a mismatch —
 * done here, not as a LoginFormView-local effect, because this route
 * element is the thing that would otherwise already have redirected away
 * on the exact same state transition. See LOGIN_SPEC.md §14.2.
 */
export default function PostLoginInstitutionGate() {
  const { user, loading, institutionId, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user) return;

    const pending = consumePendingLoginInstitution();
    if (pending === null) {
      // No login attempt just happened on this route (e.g. an already-
      // signed-in session hitting /login directly) — preserve today's
      // behavior exactly.
      navigate("/dashboard", { replace: true });
      return;
    }
    if (doesInstitutionMatch(pending, institutionId)) {
      navigate("/dashboard", { replace: true });
    } else {
      signOut().then(() => {
        navigate("/login", { replace: true, state: { error: MISMATCH_ERROR } });
      });
    }
  }, [loading, user, institutionId, navigate, signOut]);

  // While still resolving, or not signed in at all: render the login page
  // itself, same as today. Once resolved-and-signed-in, the effect above
  // takes over on the next tick — render nothing in that brief instant
  // rather than flashing the login form again.
  if (!loading && user) return null;
  return <LoginPage />;
}
