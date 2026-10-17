import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, Role, type UserPhotoDocument } from './firebase';
import { INACTIVE_ACCOUNT_MESSAGE, isAccountInactive } from './accountStatus';
import { dropForeignDrafts, setDraftOwner } from './attendanceDraft';
import { startQueryPersistence } from './queryPersistence';
import {
  SESSION_SIGNIN_KEY,
  purgeSession,
  reloadToLogin,
  stashAccountNotice,
  takeAccountNotice,
} from './sessionPurge';
import { claimSession, releaseSession } from './sessionLock';
import { SESSION_IN_USE_MESSAGE, SESSION_TAKEN_MESSAGE, toMillis } from './sessionLockLogic';
import { PROFILE_UNREADABLE_MESSAGE } from './signInFailure';

export interface InstitutionBrand {
  name: string;
  motto?: string;
  phone?: string;
  email?: string;
  address?: string;
  brandColor?: string;
  logoUrl?: string;
  profileComplete?: boolean;
  classSupervisorLabel?: string;
  gradeSupervisorLabel?: string;
  principalLabel?: string;
  vicePrincipalLabel?: string;
  gradingSystem?: string;
  // CUSTOM_CALENDAR_MODE_SPEC.md §4.1 — undefined means the super_admin
  // skipped the onboarding choice (or this institution predates the field),
  // which is exactly what InstitutionProfileWizard's one-time interstitial
  // checks for.
  calendarMode?: 'academic_year' | 'custom';
}

interface AuthContextValue {
  user: User | null;
  role: Role | null;
  institutionId: string | null;
  institution: InstitutionBrand | null;
  displayName: string | null;
  phone: string | null;
  address: string | null;
  userStatus: string | null;
  department: string | null;
  emergencyContact: string | null;
  linkedAccounts: string | null;
  classId: string | null;
  // The users-doc departmentId (not the display name in `department`); read
  // once here so teacher forms don't each re-read the user document.
  departmentId: string | null;
  mustChangePassword: boolean;
  // Set when a sign-in is rejected because an admin deactivated the account;
  // the login page shows it. Cleared on the next sign-in attempt.
  accountNotice: string | null;
  // See docs/miscellaneous-specs/PHOTO_UPLOAD_SPEC.md §UI/UX Changes Per
  // Surface "Navbar / TopHeader" — Firestore (users/{uid}/photo/current) is
  // the sole source of truth for display everywhere, never Firebase Auth's
  // own photoURL field. null means "no photo set", not "not yet loaded";
  // consumers show their existing fallback (initials/generic icon) for null.
  photoUrl: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  // `notice` is shown on the login page after the sign-out (it survives the reload).
  signOut: (notice?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [userStatus, setUserStatus] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [emergencyContact, setEmergencyContact] = useState<string | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<string | null>(null);
  const [classId, setClassId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [institution, setInstitution] = useState<InstitutionBrand | null>(null);
  const [loading, setLoading] = useState(true);
  // A sign-out reloads the page (sessionPurge.ts), so a reason given for it is
  // carried across in sessionStorage and picked up here.
  const [accountNotice, setAccountNotice] = useState<string | null>(() => takeAccountNotice());
  // The uid of the user we last saw signed in; lets the "signed out" branch below
  // tell a real loss of a session (purge + reload) from the first anonymous load.
  const lastUidRef = useRef<string | null>(null);
  // fetchRole runs from a mount-once effect, so the session-lost callback it hands
  // to the lock goes through a ref that always points at the latest handler.
  const sessionLostRef = useRef<() => void>(() => {});

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Per-user browser state: drafts are keyed to this uid (anyone else's are
        // removed) and the persisted query cache is restored for this uid only.
        lastUidRef.current = firebaseUser.uid;
        setDraftOwner(firebaseUser.uid);
        dropForeignDrafts(firebaseUser.uid);
        startQueryPersistence(firebaseUser.uid);
        // Without this, `loading` can already be false (e.g. from the login
        // page's own anonymous-state resolution) at the moment a sign-in
        // completes, letting Protected render the dashboard with stale
        // role/institution before fetchRole's awaits below resolve.
        setLoading(true);
        await fetchRole(firebaseUser.uid);
      } else {
        setDraftOwner(null);
        if (lastUidRef.current !== null) {
          // A signed-in session just ended — whichever way (button, inactivity,
          // displaced, deactivated, expired or revoked token). Remove everything
          // kept in this browser and start cold; see sessionPurge.ts.
          lastUidRef.current = null;
          purgeSession();
          reloadToLogin();
        }
        setRole(null);
        setInstitutionId(null);
        setDisplayName(null);
        setPhone(null);
        setAddress(null);
        setUserStatus(null);
        setDepartment(null);
        setEmergencyContact(null);
        setLinkedAccounts(null);
        setClassId(null);
        setDepartmentId(null);
        setMustChangePassword(false);
        setPhotoUrl(null);
        setInstitution(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  async function fetchRole(uid: string) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.data();
      const fetchedRole = (data?.role as Role) ?? null;

      if (!fetchedRole) {
        // Authenticated but no role means the user document is missing or incomplete.
        // Sign them out so they land on the login page instead of a broken shell.
        await firebaseSignOut(auth);
        return;
      }

      // Deactivated by an admin: firestore.rules no longer match this account
      // for anything but reading its own document (which is how we got here),
      // so every other page would fail with a permissions error. Sign out with
      // a clear message instead.
      if (isAccountInactive(data?.status)) {
        setAccountNotice(INACTIVE_ACCOUNT_MESSAGE);
        stashAccountNotice(INACTIVE_ACCOUNT_MESSAGE);
        await firebaseSignOut(auth);
        return;
      }

      // One active session per account (sessionLock.ts; a no-op unless the
      // feature is enabled for this build). Another live session holds it: this
      // sign-in is refused, so sign straight back out with an explanation. The
      // lock was never ours, so there is nothing to release.
      const holdsSession = await claimSession(uid, toMillis(data?.sessionResetAt), () => sessionLostRef.current());
      if (!holdsSession) {
        setAccountNotice(SESSION_IN_USE_MESSAGE);
        stashAccountNotice(SESSION_IN_USE_MESSAGE);
        await firebaseSignOut(auth);
        return;
      }

      setRole(fetchedRole);
      setInstitutionId(fetchedRole === 'super_admin' ? '*' : (data?.institutionId as string) ?? null);
      setDisplayName((data?.name as string) ?? null);
      setPhone((data?.phone as string) ?? null);
      setAddress((data?.address as string) ?? null);
      setUserStatus((data?.status as string) ?? null);
      setDepartment((data?.department as string) ?? null);
      setEmergencyContact((data?.emergencyContact as string) ?? null);
      setLinkedAccounts((data?.linkedAccounts as string) ?? null);
      setClassId(fetchedRole === 'student' ? ((data?.classId as string) ?? null) : null);
      setDepartmentId((data?.departmentId as string | null | undefined) ?? null);
      setMustChangePassword((data?.mustChangePassword as boolean) ?? false);

      try {
        const photoSnap = await getDoc(doc(db, 'users', uid, 'photo', 'current'));
        setPhotoUrl(photoSnap.exists() ? ((photoSnap.data() as UserPhotoDocument).dataUrl ?? null) : null);
      } catch {
        setPhotoUrl(null); // non-fatal; photo is display-only
      }

      // Fetch institution brand data for non-super_admin users
      if (fetchedRole !== 'super_admin') {
        const instId = (data?.institutionId as string) ?? '';
        if (instId) {
          try {
            const instSnap = await getDoc(doc(db, 'institutions', instId));
            if (instSnap.exists()) {
              const d = instSnap.data();
              setInstitution({
                name:                  (d.name       as string) ?? '',
                motto:                 d.motto       as string | undefined,
                phone:                 d.phone       as string | undefined,
                email:                 d.email       as string | undefined,
                address:               d.address     as string | undefined,
                brandColor:            d.brandColor  as string | undefined,
                logoUrl:               d.logoUrl     as string | undefined,
                profileComplete:       d.profileComplete as boolean | undefined,
                classSupervisorLabel:  d.classSupervisorLabel  as string | undefined,
                gradeSupervisorLabel:  d.gradeSupervisorLabel  as string | undefined,
                principalLabel:        d.principalLabel        as string | undefined,
                vicePrincipalLabel:    d.vicePrincipalLabel    as string | undefined,
                gradingSystem:         d.gradingSystem         as string | undefined,
                calendarMode:          d.calendarMode          as 'academic_year' | 'custom' | undefined,
              });
            } else {
              setInstitution(null);
            }
          } catch {
            setInstitution(null); // non-fatal; brand data is display-only
          }
        }
      } else {
        setInstitution(null); // super_admin has no single institution
      }

      const fetchedInstitutionId = (data?.institutionId as string) ?? '';
      if (!sessionStorage.getItem(SESSION_SIGNIN_KEY)) {
        try {
          await addDoc(collection(db, 'users', uid, 'activity_log'), {
            eventType: 'sign_in',
            detail: '',
            // Legacy client-supplied time (display + ordering); recordedAt is
            // the server-verified one the rules require (== request.time).
            timestamp: new Date().toISOString(),
            recordedAt: serverTimestamp(),
            uid,
            institutionId: fetchedInstitutionId,
          });
          sessionStorage.setItem(SESSION_SIGNIN_KEY, '1');
        } catch {
          // activity log write is non-critical — never propagate to the outer catch
        }
      }
    } catch {
      // Fatal: users/{uid} was unreachable or permission-denied.
      // A user with no readable primary profile cannot safely use the app. Say so on the login
      // page (the notice survives the sign-out reload) rather than dropping them there unexplained.
      setAccountNotice(PROFILE_UNREADABLE_MESSAGE);
      stashAccountNotice(PROFILE_UNREADABLE_MESSAGE);
      await releaseSession();
      await firebaseSignOut(auth);
    } finally {
      setLoading(false);
    }
  }

  async function refreshProfile() {
    if (!user) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      const data = snap.data();
      setDisplayName((data?.name as string) ?? null);
      setPhone((data?.phone as string) ?? null);
      setAddress((data?.address as string) ?? null);
      setUserStatus((data?.status as string) ?? null);
      setDepartment((data?.department as string) ?? null);
      setEmergencyContact((data?.emergencyContact as string) ?? null);
      setLinkedAccounts((data?.linkedAccounts as string) ?? null);
      setMustChangePassword((data?.mustChangePassword as boolean) ?? false);
      if (role === 'student') {
        setClassId((data?.classId as string) ?? null);
      }

      try {
        const photoSnap = await getDoc(doc(db, 'users', user.uid, 'photo', 'current'));
        setPhotoUrl(photoSnap.exists() ? ((photoSnap.data() as UserPhotoDocument).dataUrl ?? null) : null);
      } catch {
        // non-fatal — stale/missing photo is acceptable if the refresh read fails
      }

      // Refresh institution data alongside user profile
      if (role && role !== 'super_admin') {
        const instId = (data?.institutionId as string) ?? '';
        if (instId) {
          try {
            const instSnap = await getDoc(doc(db, 'institutions', instId));
            if (instSnap.exists()) {
              const d = instSnap.data();
              setInstitution({
                name:                  (d.name       as string) ?? '',
                motto:                 d.motto       as string | undefined,
                phone:                 d.phone       as string | undefined,
                email:                 d.email       as string | undefined,
                address:               d.address     as string | undefined,
                brandColor:            d.brandColor  as string | undefined,
                logoUrl:               d.logoUrl     as string | undefined,
                profileComplete:       d.profileComplete as boolean | undefined,
                classSupervisorLabel:  d.classSupervisorLabel  as string | undefined,
                gradeSupervisorLabel:  d.gradeSupervisorLabel  as string | undefined,
                principalLabel:        d.principalLabel        as string | undefined,
                vicePrincipalLabel:    d.vicePrincipalLabel    as string | undefined,
                gradingSystem:         d.gradingSystem         as string | undefined,
                calendarMode:          d.calendarMode          as 'academic_year' | 'custom' | undefined,
              });
            }
          } catch {
            // non-fatal
          }
        }
      }
    } catch {
      // non-critical — stale context is acceptable if the refresh read fails
    }
  }

  async function signIn(email: string, password: string) {
    setAccountNotice(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  }

  // This session was displaced (an administrator cleared it and someone else
  // signed in): sign out and say why. The lock is no longer ours to release.
  function handleSessionLost() {
    setAccountNotice(SESSION_TAKEN_MESSAGE);
    void signOut(SESSION_TAKEN_MESSAGE);
  }
  sessionLostRef.current = handleSessionLost;

  async function signOut(notice?: string) {
    if (notice) stashAccountNotice(notice);
    // Give the account's session lock up BEFORE signing out of Firebase Auth (the
    // database write needs it); never blocks or throws.
    await releaseSession();
    // Signing out fires onAuthStateChanged(null), which purges every browser-side
    // copy (query cache, filters, drafts, persisted cache) and reloads to /login —
    // the same path an expired or revoked session takes.
    await firebaseSignOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, role, institutionId, institution, displayName, phone, address, userStatus, department, emergencyContact, linkedAccounts, classId, departmentId, mustChangePassword, accountNotice, photoUrl, loading, signIn, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
