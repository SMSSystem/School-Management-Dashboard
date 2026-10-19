import { describe, expect, it } from 'vitest';
import { decidePostLogin } from '../postLoginDecision';
import { PLATFORM_ADMIN_SENTINEL } from '../pendingLoginInstitution';
import gateRaw from '../../components/PostLoginInstitutionGate.tsx?raw';
import tourStepsRaw from '../useTourSteps.ts?raw';

// What the gate does once a sign-in resolves, and the guards that keep sign-in from reading the institution
// document more than once (AuthContext reads it; nothing else at sign-in should).

const lf = (s: string) => s.split('\r\n').join('\n');

describe('decidePostLogin', () => {
  it('goes to the dashboard when no login attempt just happened on this route', () => {
    expect(decidePostLogin({ pending: null, institutionId: 'i1', institutionExists: true })).toBe('dashboard');
    expect(decidePostLogin({ pending: null, institutionId: 'i1', institutionExists: false })).toBe('dashboard');
  });

  it('goes to the dashboard when the account belongs to the picked institution and it exists', () => {
    expect(decidePostLogin({ pending: 'i1', institutionId: 'i1', institutionExists: true })).toBe('dashboard');
  });

  it('is a mismatch when the account belongs to another institution, whatever the document says', () => {
    expect(decidePostLogin({ pending: 'i2', institutionId: 'i1', institutionExists: true })).toBe('mismatch');
    expect(decidePostLogin({ pending: 'i2', institutionId: 'i1', institutionExists: false })).toBe('mismatch');
    expect(decidePostLogin({ pending: 'i1', institutionId: null, institutionExists: null })).toBe('mismatch');
  });

  it('is deleted only when the document is confirmed missing', () => {
    expect(decidePostLogin({ pending: 'i1', institutionId: 'i1', institutionExists: false })).toBe('deleted');
  });

  it('fails open when the document could not be checked (a failed read is not a deleted institution)', () => {
    expect(decidePostLogin({ pending: 'i1', institutionId: 'i1', institutionExists: null })).toBe('dashboard');
  });

  it('never calls the platform administrator’s sign-in deleted: there is no institution to check', () => {
    expect(decidePostLogin({ pending: PLATFORM_ADMIN_SENTINEL, institutionId: '*', institutionExists: false })).toBe('dashboard');
    expect(decidePostLogin({ pending: PLATFORM_ADMIN_SENTINEL, institutionId: '*', institutionExists: null })).toBe('dashboard');
  });
});

describe('sign-in reads the institution once', () => {
  it('the gate uses what AuthContext loaded and does not read institutions/{id} itself', () => {
    const gate = lf(gateRaw);
    expect(gate).toContain('institutionExists');
    expect(gate).toContain('decidePostLogin(');
    expect(gate).not.toMatch(/getDoc\(\s*doc\(db,\s*["']institutions["']/);
  });

  it('the product tour takes the institution from useAuth() and the years from the shared calendar query', () => {
    const tour = lf(tourStepsRaw);
    expect(tour).not.toMatch(/getDoc\(\s*doc\(db,\s*['"]institutions['"]/);
    expect(tour).not.toMatch(/getDocs\(\s*institutionCollection\(\s*institutionId,\s*['"]academicYears['"]/);
  });
});
