import { Role, setRole, setToken, clearAuth, setInstitutionId, SUPER_ADMIN_INSTITUTION_SENTINEL } from '@/lib/auth';

type LoginResponse = {
  token: string;
  role: Role;
  user?: unknown;
};

// Chooses mock vs real based on env presence
const API_URL = (import.meta as any).env?.VITE_API_URL as string | undefined;
const AUTH_MODE = ((import.meta as any).env?.VITE_AUTH_MODE as string | undefined) ?? (API_URL ? 'real' : 'mock');

export async function login(email: string, password: string): Promise<LoginResponse> {
  if (AUTH_MODE === 'mock') {
    // Simulate server-side auth
    // Add minimal check to mimic validation
    if (!email || !password) {
      throw new Error('Please enter email and password.');
    }
    const role: Role = 'institution_admin';
    const token = 'mock-token';
    const institutionId = 'mock-institution-id';
    setToken(token);
    setRole(role);
    setInstitutionId(institutionId);
    return { token, role };
  }

  const base = API_URL ?? '';
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    let msg = 'Login failed';
    try {
      const err = await res.json();
      msg = err?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  const token: string = data.token || data.accessToken;
  const role: Role = data.role || data.user?.role || 'institution_admin';
  const institutionId: string = data.institutionId || (role === 'super_admin' ? SUPER_ADMIN_INSTITUTION_SENTINEL : '');
  if (!token) throw new Error('Invalid server response: missing token');

  setToken(token);
  setRole(role);
  setInstitutionId(institutionId);
  return { token, role, user: data.user };
}

export function logout() {
  clearAuth();
}

