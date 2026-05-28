import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { auth, db, Role } from './firebase';

interface AuthContextValue {
  user: User | null;
  role: Role | null;
  institutionId: string | null;
  displayName: string | null;
  phone: string | null;
  address: string | null;
  userStatus: string | null;
  department: string | null;
  emergencyContact: string | null;
  linkedAccounts: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
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
  const [loading, setLoading] = useState(true);

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

      setRole(fetchedRole);
      setInstitutionId(fetchedRole === 'super_admin' ? '*' : (data?.institutionId as string) ?? null);
      setDisplayName((data?.name as string) ?? null);
      setPhone((data?.phone as string) ?? null);
      setAddress((data?.address as string) ?? null);
      setUserStatus((data?.status as string) ?? null);
      setDepartment((data?.department as string) ?? null);
      setEmergencyContact((data?.emergencyContact as string) ?? null);
      setLinkedAccounts((data?.linkedAccounts as string) ?? null);

      const fetchedInstitutionId = (data?.institutionId as string) ?? '';
      if (!sessionStorage.getItem(SESSION_SIGNIN_KEY)) {
        sessionStorage.setItem(SESSION_SIGNIN_KEY, '1');
        await addDoc(collection(db, 'users', uid, 'activity_log'), {
          eventType: 'sign_in',
          detail: '',
          timestamp: new Date().toISOString(),
          uid,
          institutionId: fetchedInstitutionId,
        });
      }
    } catch {
      // Fatal: users/{uid} was unreachable or permission-denied.
      // A user with no readable primary profile cannot safely use the app.
      await firebaseSignOut(auth);
    } finally {
      setLoading(false);
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
    await firebaseSignOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, role, institutionId, displayName, phone, address, userStatus, department, emergencyContact, linkedAccounts, loading, signIn, signOut }}>
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
