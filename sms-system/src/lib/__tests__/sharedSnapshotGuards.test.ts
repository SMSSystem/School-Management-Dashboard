import { describe, expect, it } from 'vitest';
import { LISTENER_KEEP_OPEN_MS } from '../queryPolicies';
import authContextRaw from '../AuthContext.tsx?raw';
import sharedSnapshotRaw from '../sharedSnapshot.ts?raw';
import lessonNotesRaw from '../../hooks/useLessonNotes.ts?raw';

// Guards for the shared live listeners (sharedListener.ts, sharedSnapshot.ts): the pages that use them, and the
// two rules that keep one person's listener from ever serving another: keys carry the signed-in user's id, and
// every listener is closed when the signed-in person changes.

const lf = (s: string) => s.split('\r\n').join('\n');
const pages = import.meta.glob('../../scenes/\\(dashboard\\)/**/*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const PREFIX = '../../scenes/(dashboard)/';

const SHARED_PAGES = [
  'list/assignments/index.tsx',
  'list/classes/index.tsx',
  'list/exams/index.tsx',
  'list/results/index.tsx',
  'list/feedback/index.tsx',
  'list/houses/index.tsx',
  'disciplinary-actions/index.tsx',
  'report-cards/index.tsx',
  'progress-reports/index.tsx',
];

describe('the shared live lists', () => {
  it('stay open for five minutes after the last page leaves', () => {
    expect(LISTENER_KEEP_OPEN_MS).toBe(5 * 60_000);
  });

  it.each(SHARED_PAGES)('%s subscribes through subscribeSnapshot and opens no listener of its own', (rel) => {
    const src = lf(pages[PREFIX + rel]);
    expect(src, rel).toContain('subscribeSnapshot(');
    expect(src, rel).not.toMatch(/(?<![\w.])onSnapshot\(/);
  });

  it('the lesson notes hook subscribes through subscribeSnapshot too', () => {
    const src = lf(lessonNotesRaw);
    expect(src).toContain('subscribeSnapshot(');
    expect(src).not.toMatch(/(?<![\w.])onSnapshot\(/);
  });

  it('a listener key carries the signed-in user, so it cannot be shared across accounts', () => {
    const src = lf(sharedSnapshotRaw);
    expect(src).toContain("const scope = () => auth.currentUser?.uid ?? 'signed-out';");
    expect(src).toContain('`${scope()}|${key}`');
  });

  it('a key asked for with a different query is never shared (the registry compares the queries themselves)', () => {
    const src = lf(sharedSnapshotRaw);
    expect(src).toContain('queryEqual(');
    expect(src).toContain('refEqual(');
  });

  it('AuthContext closes every shared listener at sign-in and at sign-out', () => {
    const src = lf(authContextRaw);
    expect(src).toContain("import { clearSharedListeners } from './sharedSnapshot';");
    expect(src.match(/clearSharedListeners\(\);/g)).toHaveLength(2);
    // the sign-in branch clears before the profile loads, the sign-out branch before the purge and reload
    expect(src.indexOf('clearSharedListeners();')).toBeLessThan(src.indexOf('await fetchRole(firebaseUser.uid);'));
    expect(src.lastIndexOf('clearSharedListeners();')).toBeLessThan(src.indexOf('purgeSession();'));
  });
});
