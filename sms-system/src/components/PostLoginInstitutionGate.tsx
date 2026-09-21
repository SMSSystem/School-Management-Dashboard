import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  consumePendingLoginInstitution,
  doesInstitutionMatch,
} from "@/lib/pendingLoginInstitution";
import LoginPage from "@/scenes/(auth)/login";

const MISMATCH_ERROR =
  "This account doesn't belong to the selected institution. Select the correct institution and try again.";
const DELETED_INSTITUTION_ERROR =
  "That institution is no longer available. Please contact your administrator.";

/**
 * Replaces a plain `!loading && user ? <Navigate to="/dashboard" /> : <LoginPage />`
 * at the /login route. The extra step: if a login attempt just wrote a
 * pending institution selection (LoginFormView, right before calling
 * signIn()), compare it against the now-resolved institutionId before
 * allowing the transition to /dashboard, and sign back out on a mismatch —
 * done here, not as a LoginFormView-local effect, because this route
 * element is the thing that would otherwise already have redirected away
 * on the exact same state transition. See docs/login/LOGIN_ARCHITECTURE.md §3.
 */
export default function PostLoginInstitutionGate() {
  const { user, loading, role, institutionId, signOut } = useAuth();
  const navigate = useNavigate();
  // True for the whole "we've decided this is a mismatch and are signing
  // back out" window. Without it, the render logic below would briefly
  // return null (see below) the instant `user` flips back to null as part
  // of our own signOut() call — unmounting LoginPage/LoginFormView and
  // losing their local state (the "choice" vs "login" view, the retained
  // email) right when we're about to show the mismatch error on them.
  const [mismatchInProgress, setMismatchInProgress] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    // `role` (and therefore `institutionId`) can lag one render behind
    // `user`/`loading` — e.g. AuthContext's own fetchRole() is signing this
    // account back out because users/{uid} has no resolvable role. Treating
    // a not-yet-resolved institutionId as a mismatch in that window would
    // show a misleading "wrong institution" error for what's actually an
    // unrelated account problem. Wait for role to resolve one way or the
    // other before deciding anything; AuthContext's own sign-out (if that's
    // what's happening) will complete and this effect will simply see
    // `!user` next time.
    if (!role) return;

    const pending = consumePendingLoginInstitution();
    if (pending === null) {
      // No login attempt just happened on this route (e.g. an already-
      // signed-in session hitting /login directly) — preserve today's
      // behavior exactly.
      setMismatchInProgress(false);
      navigate("/dashboard", { replace: true });
      return;
    }
    if (!doesInstitutionMatch(pending, institutionId)) {
      setMismatchInProgress(true);
      signOut().then(() => {
        navigate("/login", { replace: true, state: { error: MISMATCH_ERROR } });
      });
      return;
    }

    // The login dropdown lists every registration_directory entry
    // unfiltered — an institution can be removed out-of-band (e.g. manual
    // cleanup) while its directory entry lingers, leaving a stale,
    // selectable option. institutions/{id} isn't publicly readable
    // (firestore.rules requires being signed in and matching institutionId,
    // or super_admin), so this can only be checked here, post-auth, not
    // before signIn() is called. institutionId === "*" is the Platform
    // Administration sentinel path (super_admin) — no real institution doc
    // to check there.
    if (institutionId && institutionId !== "*") {
      setMismatchInProgress(true);
      getDoc(doc(db, "institutions", institutionId)).then((snap) => {
        if (snap.exists()) {
          setMismatchInProgress(false);
          navigate("/dashboard", { replace: true });
        } else {
          signOut().then(() => {
            navigate("/login", { replace: true, state: { error: DELETED_INSTITUTION_ERROR } });
          });
        }
      });
      return;
    }

    setMismatchInProgress(false);
    navigate("/dashboard", { replace: true });
  }, [loading, user, role, institutionId, navigate, signOut]);

  // While still resolving, not signed in, or mid-mismatch-signout: render
  // the login page. Once resolved-and-signed-in with nothing left to
  // decide, the effect above takes over on the next tick — render nothing
  // in that brief instant rather than flashing the login form again.
  if (!mismatchInProgress && !loading && user) return null;
  return <LoginPage />;
}
