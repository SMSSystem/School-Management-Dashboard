export type Role = 'super_admin' | 'institution_admin' | 'teacher' | 'student' | 'parent';

const ROLE_KEY = 'role';
const TOKEN_KEY = 'token';
const INSTITUTION_ID_KEY = 'institutionId';

export const SUPER_ADMIN_INSTITUTION_SENTINEL = '*';

export function getRoleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    super_admin: 'Super Admin',
    institution_admin: 'Admin',
    teacher: 'Teacher',
    student: 'Student',
    parent: 'Parent',
  };
  return labels[role];
}

export function getRole(): Role | null {
  const v = typeof window !== 'undefined' ? window.localStorage.getItem(ROLE_KEY) : null;
  if (!v) return null;
  if (v === 'super_admin' || v === 'institution_admin' || v === 'teacher' || v === 'student' || v === 'parent') return v;
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

export function getInstitutionId(): string | null {
  return typeof window !== 'undefined' ? window.localStorage.getItem(INSTITUTION_ID_KEY) : null;
}

export function setInstitutionId(id: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(INSTITUTION_ID_KEY, id);
  }
}

export function clearInstitutionId() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(INSTITUTION_ID_KEY);
  }
}

export function clearAuth() {
  clearToken();
  clearRole();
  clearInstitutionId();
}

export function isAuthenticated(): boolean {
  return !!getToken() && !!getRole() && !!getInstitutionId();
}
