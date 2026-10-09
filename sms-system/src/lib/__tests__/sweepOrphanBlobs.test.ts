import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  DEFAULT_GRACE_DAYS,
  MIN_GRACE_DAYS,
  classifyBlobs,
  counterPlan,
  findDangling,
  isValidInstitutionId,
  pairKey,
  parseGraceDays,
  shortKey,
  sumByInstitution,
  withBadSize,
  type Blob,
} from '../../../scripts/sweepOrphanBlobsLogic.mjs';
import scriptRaw from '../../../scripts/sweep-orphan-blobs.mjs?raw';

// scripts/sweep-orphan-blobs.mjs decides what to delete from a handful of pure
// rules (sweepOrphanBlobsLogic.mjs). Deleting the wrong file loses someone's
// lesson material, so each rule is pinned here. The script's own I/O is not run
// (it needs a service-account key); its safety properties are checked as text.

const NOW = 1_800_000_000_000;
const GRACE = DEFAULT_GRACE_DAYS * DAY_MS;
const blob = (institutionId: string, key: string, ageDays: number | null, size: unknown = 1000): Blob => ({
  institutionId,
  key,
  size,
  uploadedAt: ageDays === null ? undefined : NOW - ageDays * DAY_MS,
});

describe('parseGraceDays', () => {
  it('defaults to 7 days', () => {
    expect(DEFAULT_GRACE_DAYS).toBe(7);
    expect(parseGraceDays(undefined)).toBe(7);
    expect(parseGraceDays('')).toBe(7);
    expect(parseGraceDays(null)).toBe(7);
  });

  it('accepts a number of days of at least one', () => {
    expect(parseGraceDays('14')).toBe(14);
    expect(parseGraceDays('1')).toBe(MIN_GRACE_DAYS);
    expect(parseGraceDays(2.5)).toBe(2.5);
  });

  it('refuses a grace period short enough to catch an upload in flight', () => {
    for (const bad of ['0', '0.5', '-3', 'abc', 'NaN']) {
      expect(() => parseGraceDays(bad), bad).toThrow('at least 1');
    }
  });
});

describe('classifyBlobs', () => {
  const referenced = new Set([pairKey('i1', 'kept')]);
  const classify = (blobs: Blob[]) => classifyBlobs({ blobs, referenced, nowMs: NOW, graceMs: GRACE });

  it('keeps a file a record still points at, however old', () => {
    const r = classify([blob('i1', 'kept', 400)]);
    expect(r.referenced).toHaveLength(1);
    expect(r.orphans).toHaveLength(0);
  });

  it('keeps an unreferenced file uploaded within the grace period (its record may be on the way)', () => {
    const r = classify([blob('i1', 'new', 0), blob('i1', 'six', 6.99)]);
    expect(r.recent).toHaveLength(2);
    expect(r.orphans).toHaveLength(0);
  });

  it('deletes an unreferenced file at or past the grace period', () => {
    const r = classify([blob('i1', 'edge', 7), blob('i1', 'old', 30)]);
    expect(r.orphans.map((b) => b.key)).toEqual(['edge', 'old']);
  });

  it('never deletes a file whose age is unknown', () => {
    const r = classify([blob('i1', 'noage', null), { institutionId: 'i1', key: 'nan', uploadedAt: Number.NaN }]);
    expect(r.unknownAge).toHaveLength(2);
    expect(r.orphans).toHaveLength(0);
  });

  it('never treats a file uploaded "in the future" as old', () => {
    const r = classify([blob('i1', 'future', -2)]);
    expect(r.recent).toHaveLength(1);
  });

  it('matches a reference by institution AND key, not by key alone', () => {
    const r = classify([blob('i2', 'kept', 30)]); // same key, other institution's folder
    expect(r.referenced).toHaveLength(0);
    expect(r.orphans).toHaveLength(1);
  });

  it('puts every file in exactly one group', () => {
    const all = [blob('i1', 'kept', 1), blob('i1', 'a', 1), blob('i1', 'b', 9), blob('i1', 'c', null), blob('i2', 'd', 100)];
    const r = classify(all);
    expect(r.referenced.length + r.recent.length + r.unknownAge.length + r.orphans.length).toBe(all.length);
  });

  it('with nothing referenced, deletes only the old files', () => {
    const r = classifyBlobs({
      blobs: [blob('i1', 'a', 1), blob('i1', 'b', 20)],
      referenced: new Set(),
      nowMs: NOW,
      graceMs: GRACE,
    });
    expect(r.orphans.map((b) => b.key)).toEqual(['b']);
  });
});

describe('findDangling', () => {
  it('lists references whose file is missing, sorted', () => {
    const referenced = new Set([pairKey('i1', 'b'), pairKey('i1', 'a'), pairKey('i2', 'c')]);
    const present = new Set([pairKey('i1', 'a')]);
    expect(findDangling(referenced, present)).toEqual(['i1/b', 'i2/c']);
    expect(findDangling(new Set(), present)).toEqual([]);
  });
});

describe('sumByInstitution and withBadSize', () => {
  it('adds the sizes per institution and in total', () => {
    const s = sumByInstitution([blob('i1', 'a', 1, 100), blob('i1', 'b', 1, 50), blob('i2', 'c', 1, 7)]);
    expect(s.perInstitution.get('i1')).toBe(150);
    expect(s.perInstitution.get('i2')).toBe(7);
    expect(s.total).toBe(157);
  });

  it('counts a missing, zero, negative or non-numeric size as 0 and reports it', () => {
    const list = [blob('i1', 'a', 1, 100), { ...blob('i1', 'b', 1), size: undefined }, blob('i1', 'c', 1, 'x'), blob('i1', 'd', 1, -5), blob('i1', 'e', 1, 0)];
    expect(sumByInstitution(list).total).toBe(100);
    expect(withBadSize(list).map((b) => b.key)).toEqual(['b', 'c', 'd', 'e']);
  });
});

describe('counterPlan', () => {
  const actual = sumByInstitution([blob('i1', 'a', 1, 100), blob('i2', 'b', 1, 40)]);

  it('plans nothing when every counter already matches', () => {
    expect(counterPlan({ stored: { institutions: { i1: 100, i2: 40 }, total: 140 }, actual })).toEqual([]);
  });

  it('plans a correction for each counter that differs, institutions first, then the total', () => {
    const plan = counterPlan({ stored: { institutions: { i1: 250, i2: 40 }, total: 290 }, actual });
    expect(plan).toEqual([
      { path: 'usage/institutions/i1/bytes', label: 'institution i1', from: 250, to: 100 },
      { path: 'usage/total/bytes', label: 'total', from: 290, to: 140 },
    ]);
  });

  it('plans a counter that has no files left down to 0, and one with no counter up to its files', () => {
    const plan = counterPlan({ stored: { institutions: { gone: 500 }, total: 640 }, actual });
    expect(plan.find((c) => c.path === 'usage/institutions/gone/bytes')).toEqual({
      path: 'usage/institutions/gone/bytes',
      label: 'institution gone',
      from: 500,
      to: 0,
    });
    expect(plan.find((c) => c.path === 'usage/institutions/i1/bytes')).toMatchObject({ from: 0, to: 100 });
    expect(plan.find((c) => c.path === 'usage/total/bytes')).toMatchObject({ from: 640, to: 140 });
  });

  it('treats a missing stored section as zero', () => {
    const plan = counterPlan({ stored: {}, actual });
    expect(plan.map((c) => c.path)).toEqual(['usage/institutions/i1/bytes', 'usage/institutions/i2/bytes', 'usage/total/bytes']);
  });
});

describe('a run limited to one institution', () => {
  const only = sumByInstitution([blob('i1', 'a', 1, 100)]); // the remaining files of i1 alone

  it('accepts only a single safe institution id', () => {
    expect(isValidInstitutionId('aB3dE5fG7hI9jK1lM2nO')).toBe(true);
    for (const bad of ['', 'a/b', 'a.b', 'a b', 'a$b', 'x'.repeat(129), null, 7, undefined]) {
      expect(isValidInstitutionId(bad), String(bad)).toBe(false);
    }
  });

  it('reconciles only that institution and moves the total by that change alone', () => {
    const plan = counterPlan({ stored: { institutions: { i1: 250, i2: 999 }, total: 1249 }, actual: only, institutionId: 'i1' });
    expect(plan).toEqual([
      { path: 'usage/institutions/i1/bytes', label: 'institution i1', from: 250, to: 100 },
      { path: 'usage/total/bytes', label: 'total (this institution’s change only)', from: 1249, to: 1099 },
    ]);
  });

  it('never touches another institution’s counter, even one that looks wrong', () => {
    const plan = counterPlan({ stored: { institutions: { i1: 250, i2: 999 }, total: 5 }, actual: only, institutionId: 'i1' });
    expect(plan.some((c) => c.path.includes('/i2/'))).toBe(false);
  });

  it('plans nothing when that institution’s counter already matches', () => {
    expect(counterPlan({ stored: { institutions: { i1: 100, i2: 999 }, total: 5000 }, actual: only, institutionId: 'i1' })).toEqual([]);
  });

  it('raises the total when the institution’s counter was too low, and never below zero', () => {
    const up = counterPlan({ stored: { institutions: { i1: 40 }, total: 1000 }, actual: only, institutionId: 'i1' });
    expect(up.find((c) => c.path === 'usage/total/bytes')).toMatchObject({ from: 1000, to: 1060 });
    const down = counterPlan({ stored: { institutions: { i1: 500 }, total: 300 }, actual: only, institutionId: 'i1' });
    expect(down.find((c) => c.path === 'usage/total/bytes')?.to).toBe(0);
  });

  it('an institution with no files left plans its counter down to 0', () => {
    const plan = counterPlan({ stored: { institutions: { i1: 80 }, total: 80 }, actual: sumByInstitution([]), institutionId: 'i1' });
    expect(plan.map((c) => [c.path, c.to])).toEqual([
      ['usage/institutions/i1/bytes', 0],
      ['usage/total/bytes', 0],
    ]);
  });

  it('the script limits listing, references and counters to it', () => {
    const script = scriptRaw.split('\r\n').join('\n');
    expect(script).toContain("else if (arg.startsWith('--institution=')) opts.institution");
    expect(script).toContain('isValidInstitutionId(opts.institution)');
    expect(script).toContain('allFolders.filter((id) => id === opts.institution)');
    expect(script).toContain('m[1] === opts.institution');
    expect(script).toContain('if (opts.institution && inst.id !== opts.institution) continue;');
    expect(script).toContain('institutionId: opts.institution');
  });
});

describe('shortKey', () => {
  it('prints only the first 8 characters of a key', () => {
    const key = '3b1ab39c-1c4e-4f0a-9d3e-0123456789ab';
    expect(shortKey(key)).toBe('3b1ab39c…');
    expect(shortKey(key)).not.toContain('4f0a');
  });
});

describe('the script', () => {
  const script = scriptRaw.split('\r\n').join('\n');

  it('is a dry run unless --apply is given, and only deletes after the apply guard', () => {
    expect(script).toContain("else if (arg === '--apply') opts.apply = true;");
    // the default is OFF: apply is only ever switched on by the flag
    expect(script).toMatch(/const opts = \{[^}]*\bapply: false,/);
    expect(script.match(/opts\.apply = true/g)).toHaveLength(1);
    expect(script).not.toMatch(/apply: true/);
    expect(script.indexOf('if (!opts.apply) {')).toBeLessThan(script.indexOf('await rtdb.ref().update(updates);'));
  });

  it('refuses a project that is not the key’s, and stops before deleting if the references cannot be read', () => {
    expect(script).toContain('serviceAccount.project_id !== opts.project');
    expect(script).toContain('Could not read the Firestore references, so nothing was changed');
    expect(script.indexOf('Could not read the Firestore references')).toBeLessThan(script.indexOf('await rtdb.ref().update(updates);'));
  });

  it('refuses to delete when no reference was found but orphans exist', () => {
    expect(script).toContain('referenced.size === 0 && result.orphans.length > 0 && !opts.allowNoReferences');
  });

  it('lists files without downloading them and never prints a full key or a body', () => {
    expect(script).toContain('?shallow=true');
    expect(script).toContain('/size`).get()');
    expect(script).toContain('/uploadedAt`).get()');
    expect(script).not.toMatch(/dataUrl/);
    // a key only ever appears through shortKey() in a message, never interpolated whole
    const printed = script.split('\n').filter((line) => /console\.(log|error)\(/.test(line));
    expect(printed.length).toBeGreaterThan(10);
    for (const line of printed) expect(line).not.toMatch(/\$\{(b\.key|key|pair)\}/);
    expect(script).toContain('shortKey(b.key)');
    expect(script).toContain('shortKey(key)');
  });

  it('corrects a counter only if it is still the value read at the start', () => {
    expect(script).toContain('Number(current ?? 0) === c.from ? c.to : undefined');
  });

  it('never writes to Firestore', () => {
    expect(script).not.toMatch(/firestore\.[^;]*\.(set|update|delete)\(/);
    expect(script).not.toMatch(/\.(set|delete)\(/);
  });
});
