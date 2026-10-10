import { describe, expect, it } from 'vitest';
import firebaseSrc from '../firebase.ts?raw';
import queryClientSrc from '../queryClient.ts?raw';
import authSrc from '../AuthContext.tsx?raw';
import mainSrc from '../../main.tsx?raw';
import formSrc from '../../components/forms/AdminCreateUserForm.tsx?raw';
import importSrc from '../../scenes/(dashboard)/import/index.tsx?raw';

// Source-text pins for the "nothing personal stays in the browser" decisions
// (internal/retcon/CLIENT_SIDE_SECURITY_TIGHTENING_PLAN.md section F). Each would
// be a silent regression, so each is pinned.
describe('client cache hardening', () => {
  it('Firestore uses an in-memory LRU cache, not the persistent IndexedDB cache', () => {
    expect(firebaseSrc).toContain('memoryLocalCache(');
    expect(firebaseSrc).toContain('memoryLruGarbageCollector(');
    expect(firebaseSrc).not.toMatch(/persistentLocalCache\s*\(/);
    expect(firebaseSrc).not.toMatch(/persistentMultipleTabManager\s*\(/);
  });

  it('the query cache is only persisted through the allow-listed, per-user persister', () => {
    expect(queryClientSrc).not.toContain('persistQueryClient(');
    expect(queryClientSrc).not.toContain('window.sessionStorage');
  });

  it('AuthContext starts persistence per uid and purges + reloads when a session ends', () => {
    expect(authSrc).toContain('startQueryPersistence(firebaseUser.uid)');
    expect(authSrc).toContain('purgeSession()');
    expect(authSrc).toContain('reloadToLogin()');
    expect(authSrc).toContain('setDraftOwner(');
  });

  it('the legacy IndexedDB cache is removed at start-up', () => {
    expect(mainSrc).toContain('cleanupLegacyFirestoreCache(');
  });

  it('the user-creation Auth instance does not persist to IndexedDB', () => {
    expect(firebaseSrc).toContain('inMemoryPersistence');
    expect(formSrc).toContain('getUserCreationAuth()');
    expect(importSrc).toContain('getUserCreationAuth()');
    expect(formSrc).not.toMatch(/getAuth\(/);
    expect(importSrc).not.toMatch(/getAuth\(/);
  });
});
