import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, Role, TeacherType } from './firebase';

interface AuthContextValue {
  user: User | null;
  role: Role | null;
  teacherType: TeacherType | null;
  institutionId: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [teacherType, setTeacherType] = useState<TeacherType | null>(null);
  const [institutionId, setInstitutionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await fetchRole(firebaseUser.uid);
      } else {
        setRole(null);
        setTeacherType(null);
        setInstitutionId(null);
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

      if (fetchedRole === 'teacher') {
        try {
          const teacherSnap = await getDoc(doc(db, 'teachers', uid));
          const raw = teacherSnap.data()?.teacherType;
          setTeacherType(raw === 'regular' || raw === 'senior' ? raw : null);
        } catch {
          // Non-fatal: supplementary teacher profile could not be read.
          // Default to null rather than invalidating a valid session.
          setTeacherType(null);
        }
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
    await firebaseSignOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, role, teacherType, institutionId, loading, signIn, signOut }}>
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
