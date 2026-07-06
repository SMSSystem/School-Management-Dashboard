import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { addDoc, getDoc } from 'firebase/firestore';
import { auth, db, Role } from './firebase';
import { institutionDoc, userActivityCollection, userDoc } from './firestorePaths';

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
  loading: boolean;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const SESSION_SIGNIN_KEY = 'sms_signin_logged';

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
  const [institution, setInstitution] = useState<InstitutionBrand | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await fetchRole(firebaseUser.uid);
      } else {
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
        setInstitution(null);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  async function fetchRole(uid: string) {
    try {
      const snap = await getDoc(userDoc(db, uid));

      if (!snap.exists()) {
        // Account exists in Firebase Auth but has no Firestore profile.
        // This means the account was not fully provisioned.
        await firebaseSignOut(auth);
        return;
      }

      const data = snap.data();
      const fetchedRole = (data?.role as Role) ?? null;

      if (!fetchedRole) {
        // Profile doc exists but role is missing — incomplete provisioning.
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

      // Fetch institution brand data for non-super_admin users
      if (fetchedRole !== 'super_admin') {
        const instId = (data?.institutionId as string) ?? '';
        if (instId) {
          try {
            const instSnap = await getDoc(institutionDoc(db, instId));
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
          await addDoc(userActivityCollection(db, uid), {
            eventType: 'sign_in',
            detail: '',
            timestamp: new Date().toISOString(),
            uid,
            institutionId: fetchedInstitutionId,
          });
          sessionStorage.setItem(SESSION_SIGNIN_KEY, '1');
        } catch {
          // activity log write is non-critical — never propagate to the outer catch
        }
      }
    } catch (err) {
      // Firestore was unreachable or permission-denied.
      // Do NOT sign out — the user successfully authenticated with Firebase Auth.
      // Show an error so they can refresh, rather than being silently kicked out.
      console.error('[AuthContext] fetchRole failed:', err);
      setProfileError(
        'Unable to load your profile. Check your connection and refresh the page. ' +
        'If this keeps happening, your Firestore security rules may need to be updated.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function refreshProfile() {
    if (!user) return;
    try {
      const snap = await getDoc(userDoc(db, user.uid));
      const data = snap.data();
      setDisplayName((data?.name as string) ?? null);
      setPhone((data?.phone as string) ?? null);
      setAddress((data?.address as string) ?? null);
      setUserStatus((data?.status as string) ?? null);
      setDepartment((data?.department as string) ?? null);
      setEmergencyContact((data?.emergencyContact as string) ?? null);
      setLinkedAccounts((data?.linkedAccounts as string) ?? null);
      if (role === 'student') {
        setClassId((data?.classId as string) ?? null);
      }
      // Refresh institution data alongside user profile
      if (role && role !== 'super_admin') {
        const instId = (data?.institutionId as string) ?? '';
        if (instId) {
          try {
            const instSnap = await getDoc(institutionDoc(db, instId));
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
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  }

  async function signOut() {
    sessionStorage.removeItem(SESSION_SIGNIN_KEY);
    setProfileError(null);
    await firebaseSignOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, role, institutionId, institution, displayName, phone, address, userStatus, department, emergencyContact, linkedAccounts, classId, loading, profileError, signIn, signOut, refreshProfile }}>
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
