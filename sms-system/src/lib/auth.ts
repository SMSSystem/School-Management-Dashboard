export type Role = 'admin' | 'teacher' | 'student' | 'parent';

const ROLE_KEY = 'role';
const TOKEN_KEY = 'token';

export function getRole(): Role | null {
  const v = typeof window !== 'undefined' ? window.localStorage.getItem(ROLE_KEY) : null;
  if (!v) return null;
  if (v === 'admin' || v === 'teacher' || v === 'student' || v === 'parent') return v;
  return null;
}

export function setRole(role: Role) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ROLE_KEY, role);
  }
}

export function clearRole() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(ROLE_KEY);
  }
}

export function getToken(): string | null {
  return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null;
}

export function setToken(token: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(TOKEN_KEY, token);
  }
}

export function clearToken() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearAuth() {
  clearToken();
  clearRole();
}

export function isAuthenticated(): boolean {
  return !!getToken() || !!getRole();
}

