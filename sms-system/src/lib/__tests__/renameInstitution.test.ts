import { describe, expect, it } from 'vitest';
import {
  BATCH_SIZE,
  chunk,
  directoryNeedsUpdate,
  normalizeName,
  pickSnapshotsToUpdate,
  planInstitutionRename,
  portalNeedsUpdate,
} from '../../../scripts/renameInstitutionLogic.mjs';
import scriptRaw from '../../../scripts/rename-institution.mjs?raw';

// scripts/rename-institution.mjs renames one institution everywhere its name is STORED
// (institution, login directory, emailed portal name, report snapshots). The decisions are
// pure and tested directly; the script is checked as source text, like the other owner scripts.

const script = scriptRaw.split('\r\n').join('\n');

const institutions = [
  { id: 'aaa', name: 'GENR8-3D Academy' },
  { id: 'bbb', name: 'Other School' },
  { id: 'master', name: 'GENR8-3D Academy' },
];

describe('normalizeName', () => {
  it('trims a valid name', () => {
    expect(normalizeName('  GENR8-3D ')).toBe('GENR8-3D');
  });

  it('refuses empty, non-text and over-long names', () => {
    for (const bad of ['', '   ', null, undefined, 5, {}, 'x'.repeat(101)]) {
      expect(normalizeName(bad as never), String(bad)).toBeNull();
    }
    expect(normalizeName('x'.repeat(100))).toBe('x'.repeat(100));
  });
});

describe('planInstitutionRename', () => {
  it('finds the one institution by its old name and ignores system documents', () => {
    expect(planInstitutionRename({ institutions, fromName: 'GENR8-3D Academy', toName: 'GENR8-3D' })).toEqual({
      action: 'rename',
      id: 'aaa',
      from: 'GENR8-3D Academy',
      to: 'GENR8-3D',
      nameChange: true,
    });
  });

  it('still finds it after the name was already changed (a re-run), with nothing to rename on the institution', () => {
    const renamed = [{ id: 'aaa', name: 'GENR8-3D' }, institutions[1]];
    expect(planInstitutionRename({ institutions: renamed, fromName: 'GENR8-3D Academy', toName: 'GENR8-3D' })).toMatchObject({
      action: 'rename',
      id: 'aaa',
      nameChange: false,
    });
  });

  it('refuses invalid names and identical names', () => {
    expect(planInstitutionRename({ institutions, fromName: '', toName: 'X' }).action).toBe('blocked');
    expect(planInstitutionRename({ institutions, fromName: 'A', toName: ' A ' }).action).toBe('blocked');
  });

  it('refuses when nothing matches', () => {
    const plan = planInstitutionRename({ institutions, fromName: 'Nope', toName: 'Also Nope' });
    expect(plan.action).toBe('blocked');
  });

  it('refuses to guess when two institutions match, and accepts --institution-id', () => {
    const twins = [
      { id: 'aaa', name: 'GENR8-3D Academy' },
      { id: 'ccc', name: 'GENR8-3D Academy' },
    ];
    expect(planInstitutionRename({ institutions: twins, fromName: 'GENR8-3D Academy', toName: 'GENR8-3D' }).action).toBe(
      'blocked',
    );
    expect(
      planInstitutionRename({ institutions: twins, fromName: 'GENR8-3D Academy', toName: 'GENR8-3D', institutionId: 'ccc' }),
    ).toMatchObject({ action: 'rename', id: 'ccc' });
  });

  it('refuses an explicit id whose name is neither the old nor the new one', () => {
    const plan = planInstitutionRename({ institutions, fromName: 'GENR8-3D Academy', toName: 'GENR8-3D', institutionId: 'bbb' });
    expect(plan.action).toBe('blocked');
  });

  it('refuses system documents and unknown ids', () => {
    expect(
      planInstitutionRename({ institutions, fromName: 'GENR8-3D Academy', toName: 'GENR8-3D', institutionId: 'master' }).action,
    ).toBe('blocked');
    expect(
      planInstitutionRename({ institutions, fromName: 'GENR8-3D Academy', toName: 'GENR8-3D', institutionId: 'zzz' }).action,
    ).toBe('blocked');
  });
});

describe('pickSnapshotsToUpdate', () => {
  it('picks only documents holding exactly the old name', () => {
    const docs = [
      { ref: 1, institutionName: 'GENR8-3D Academy' },
      { ref: 2, institutionName: 'GENR8-3D' },
      { ref: 3, institutionName: 'Something else' },
      { ref: 4 },
      { ref: 5, institutionName: ' GENR8-3D Academy ' },
    ];
    expect(pickSnapshotsToUpdate(docs, 'GENR8-3D Academy').map((d) => d.ref)).toEqual([1, 5]);
  });

  it('picks nothing for an invalid old name', () => {
    expect(pickSnapshotsToUpdate([{ institutionName: '' }], '')).toEqual([]);
  });
});

describe('directoryNeedsUpdate / portalNeedsUpdate', () => {
  it('updates the directory only when the document exists and holds a different name', () => {
    expect(directoryNeedsUpdate({ name: 'GENR8-3D Academy' }, 'GENR8-3D')).toBe(true);
    expect(directoryNeedsUpdate({ name: 'GENR8-3D' }, 'GENR8-3D')).toBe(false);
    expect(directoryNeedsUpdate(null, 'GENR8-3D')).toBe(false);
  });

  it('updates the portal name only when one was asked for and differs', () => {
    expect(portalNeedsUpdate({ portalName: 'GENR8-3D Academy Portal' }, 'GENR8-3D Portal')).toBe(true);
    expect(portalNeedsUpdate({ portalName: 'GENR8-3D Portal' }, 'GENR8-3D Portal')).toBe(false);
    expect(portalNeedsUpdate({ portalName: 'GENR8-3D Academy Portal' }, null)).toBe(false);
    expect(portalNeedsUpdate(null, 'GENR8-3D Portal')).toBe(false);
  });
});

describe('chunk', () => {
  it('splits into batches no larger than the limit', () => {
    const list = Array.from({ length: BATCH_SIZE * 2 + 1 }, (_, i) => i);
    const batches = chunk(list);
    expect(batches.map((b) => b.length)).toEqual([BATCH_SIZE, BATCH_SIZE, 1]);
    expect(batches.flat()).toEqual(list);
  });

  it('returns no batches for an empty list', () => {
    expect(chunk([])).toEqual([]);
  });
});

describe('rename-institution.mjs (source checks)', () => {
  it('is a dry run unless --live is passed', () => {
    expect(script).toContain("arg === '--live'");
    expect(script).toContain('if (opts.live) {');
    expect(script).toContain('Dry run only. Run again with --live');
  });

  it('prints the project before doing anything and writes a log', () => {
    expect(script).toContain('Project: ${key.project_id}');
    expect(script).toContain('scripts/logs');
  });

  it('writes every stored copy and nothing in the audit log', () => {
    expect(script).toContain("{ name: to, updatedAt: FieldValue.serverTimestamp() }");
    expect(script).toContain('portalName');
    expect(script).toContain("'reportCards', 'progressReports'");
    expect(script).not.toContain('audit_log');
  });

  it('refuses to run without a key', () => {
    expect(script).toContain('A service-account key is required');
  });
});
