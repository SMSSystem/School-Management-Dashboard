import { describe, expect, it } from 'vitest';

// Admin scripts use the Admin SDK, which ignores firestore.rules, so their safety is in their own code. These pin the
// habits the pre-PR review asked for in the scripts it checked, and that the one-off scripts and the teardown tools
// are where they should be.

const scriptFiles = Object.keys(import.meta.glob('../../../scripts/*.mjs')).map((p) => p.slice(p.lastIndexOf('/') + 1));

describe('the scripts folder', () => {
  it('no longer holds the one-off legacy-data scripts that hard-coded real ids', () => {
    for (const gone of [
      'list-legacy-flat-documents.mjs',
      'delete-legacy-flat-documents.mjs',
      'count-legacy-flat-collections.mjs',
      'list-legacy-gradebook-columns.mjs',
      'delete-legacy-gradebook-columns.mjs',
    ]) {
      expect(scriptFiles, gone).not.toContain(gone);
    }
  });

  it('keeps the bulk-seed teardown and its companions until the teardown has finished and passed --verify', () => {
    for (const kept of [
      'teardown-bulk-institution.mjs',
      'seed-bulk-institution.mjs',
      'count-seed-institution.mjs',
      'disable-seed-accounts.mjs',
    ]) {
      expect(scriptFiles, kept).toContain(kept);
    }
  });
});
