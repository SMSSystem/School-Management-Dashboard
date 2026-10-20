import { describe, expect, it } from 'vitest';
import backfillClassIdsRaw from '../../../scripts/backfill-student-class-ids.mjs?raw';

// Admin scripts use the Admin SDK, which ignores firestore.rules, so their safety is in their own code. These pin the
// habits the pre-PR review asked for in the scripts it checked, and that the one-off scripts and the teardown tools
// are where they should be.

const lf = (s: string) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const backfill = lf(backfillClassIdsRaw);
const scriptFiles = Object.keys(import.meta.glob('../../../scripts/*.mjs')).map((p) => p.slice(p.lastIndexOf('/') + 1));

describe('backfill-student-class-ids.mjs', () => {
  it('is a dry run unless --live is passed, and writes only behind it', () => {
    expect(backfill).toContain("if (arg === '--live') opts.live = true;");
    expect(backfill.match(/opts\.live = true/g)).toHaveLength(1);
    expect(backfill).not.toContain('--dry-run');
    expect(backfill).toContain('if (!opts.live) {');
    expect(backfill).toContain('if (opts.live && opsInBatch > 0) await batch.commit();');
    expect(backfill.indexOf('batch.update(')).toBeGreaterThan(backfill.indexOf('if (!opts.live) {'));
  });

  it('needs a key, prints the project it acts on, and checks --institution', () => {
    expect(backfill).not.toContain('applicationDefault');
    expect(backfill).toContain('console.log(`Project: ${key.project_id}`);');
    expect(backfill).toContain('A service-account key is required');
    expect(backfill).toContain('--institution must be a single institution id');
  });
});

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
