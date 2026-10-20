import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { DATA_MODE } from "@/lib/data";

// What the profile page (scenes/(dashboard)/profile) waits for before it shows: the user document and a fresh
// last-sign-in time from the Firebase user. `retryCount` restarts the load (the Retry button bumps it); the
// Activity and Audit cards restart with it. Moved from the page as it was.
export function useProfileLoad(uid: string | undefined) {
  const [profileLoading, setProfileLoading] = useState(DATA_MODE === 'live');
  const [profileLoadError, setProfileLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [freshLastSignIn, setFreshLastSignIn] = useState<string | null>(null);

  useEffect(() => {
    if (DATA_MODE !== 'live' || !uid) {
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    setProfileLoadError(false);
    auth.currentUser?.reload().then(() => {
      setFreshLastSignIn(auth.currentUser?.metadata?.lastSignInTime ?? null);
    }).catch(() => {});
    getDoc(doc(db, 'users', uid))
      .then(() => setProfileLoading(false))
      .catch(() => {
        setProfileLoading(false);
        setProfileLoadError(true);
      });
  }, [uid, retryCount]);

  return { profileLoading, profileLoadError, retryCount, setRetryCount, freshLastSignIn };
}
