import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { consumePendingLoginInstitution } from "@/lib/pendingLoginInstitution";
import { decidePostLogin } from "@/lib/postLoginDecision";
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
  const { user, loading, role, institutionId, institutionExists, signOut } = useAuth();
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

    // postLoginDecision.ts has the rules. `institutionExists` is what AuthContext found when it read the
    // institution while loading the profile, so the document is read once per sign-in, not again here.
    const decision = decidePostLogin({
      pending: consumePendingLoginInstitution(),
      institutionId,
      institutionExists,
    });

    if (decision === "mismatch") {
      setMismatchInProgress(true);
      // The message goes with the sign-out: it reloads the page, which drops the
      // router state below (that navigate only covers the moment before it).
      signOut(MISMATCH_ERROR).then(() => {
        navigate("/login", { replace: true, state: { error: MISMATCH_ERROR } });
      });
      return;
    }

    if (decision === "deleted" && institutionId) {
      // The login dropdown lists every registration_directory entry
      // unfiltered — an institution can be removed out-of-band (e.g. manual
      // cleanup) while its directory entry lingers, leaving a stale,
      // selectable option. institutions/{id} isn't publicly readable
      // (firestore.rules requires being signed in and matching institutionId,
      // or super_admin), so this can only be known here, post-auth, not
      // before signIn() is called.
      //
      // Self-heal: now that we're signed in and know it's gone, delete the
      // stale directory entry too, so this institution stops appearing in
      // the dropdown for the next person — best-effort:
      // registration_directory's delete rule only permits this for an
      // institution_admin/super_admin of this exact (now-deleted)
      // institution, so a student/teacher account hitting this same dead
      // institution won't have permission, and that's fine — sign-out below
      // still gives them a clean error either way. Awaited (not
      // fire-and-forget) so the delete request is actually sent while still
      // authenticated — signOut() below would race it otherwise, since
      // Firestore writes need the active session.
      setMismatchInProgress(true);
      deleteDoc(doc(db, "registration_directory", institutionId))
        .catch(() => {
          // Non-fatal — see comment above. Sign-out/error still proceed
          // below regardless of whether this cleanup succeeded.
        })
        .then(() => signOut(DELETED_INSTITUTION_ERROR))
        .then(() => {
          navigate("/login", { replace: true, state: { error: DELETED_INSTITUTION_ERROR } });
        });
      return;
    }

    // "dashboard": no login attempt just happened on this route (an already-signed-in session hitting /login
    // directly), the checks passed, or the institution could not be checked (a failed read fails open: stranding
    // an authenticated user here would be worse than skipping the check).
    setMismatchInProgress(false);
    navigate("/dashboard", { replace: true });
  }, [loading, user, role, institutionId, institutionExists, navigate, signOut]);

  // While still resolving, not signed in, or mid-mismatch-signout: render
  // the login page. Once resolved-and-signed-in with nothing left to
  // decide, the effect above takes over on the next tick — render nothing
  // in that brief instant rather than flashing the login form again.
  if (!mismatchInProgress && !loading && user) return null;
  return <LoginPage />;
}
