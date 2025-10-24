export type Role = 'admin' | 'teacher' | 'student' | 'parent';

const KEY = 'role';

export function getRole(): Role | null {
  const v = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
  if (!v) return null;
  if (v === 'admin' || v === 'teacher' || v === 'student' || v === 'parent') return v;
  return null;
}

export function setRole(role: Role) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY, role);
  }
}

export function clearRole() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(KEY);
  }
}

