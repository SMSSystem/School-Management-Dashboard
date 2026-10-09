import { describe, expect, it } from 'vitest';
import {
  LEGACY_FIELDS,
  LEGACY_FILE_ID,
  legacyFieldsToDrop,
  planNoteMigration,
  tally,
} from '../../../scripts/migrateLessonNoteFilesLogic.mjs';
import scriptRaw from '../../../scripts/migrate-lesson-note-files.mjs?raw';

const script = scriptRaw.split('\r\n').join('\n');

describe('planNoteMigration', () => {
  const file = { fileName: 'plan.pdf', mimeType: 'application/pdf', size: 1234 };

  it('writes the list for a note with one legacy file, from the file document', () => {
    expect(planNoteMigration({ hasAttachment: true, attachmentFileName: 'old-name.pdf' }, file)).toEqual({
      action: 'migrate',
      update: {
        attachments: [{ id: LEGACY_FILE_ID, fileName: 'plan.pdf', mimeType: 'application/pdf', size: 1234 }],
        attachmentIds: [LEGACY_FILE_ID],
      },
    });
  });

  it('falls back to the note’s own fields when the file document lacks metadata', () => {
    const plan = planNoteMigration(
      { hasAttachment: true, attachmentFileName: 'n.pdf', attachmentMimeType: 'application/pdf', attachmentSize: 9 },
      {},
    );
    expect(plan).toMatchObject({ action: 'migrate', update: { attachments: [{ fileName: 'n.pdf', size: 9 }] } });
  });

  it('uses size 0 and an empty type when neither side has them', () => {
    const plan = planNoteMigration({ hasAttachment: true }, { fileName: 'x.pdf' });
    expect(plan).toMatchObject({ action: 'migrate', update: { attachments: [{ mimeType: '', size: 0 }] } });
  });

  it('leaves a note alone that already has the list, even an empty one', () => {
    expect(planNoteMigration({ hasAttachment: true, attachments: [{ id: 'a' }] }, file)).toEqual({ action: 'already' });
    expect(planNoteMigration({ hasAttachment: false, attachments: [] }, null)).toEqual({ action: 'already' });
  });

  it('has nothing to do for a note with no file', () => {
    expect(planNoteMigration({ hasAttachment: false }, null)).toEqual({ action: 'no-file' });
    expect(planNoteMigration({}, null)).toEqual({ action: 'no-file' });
  });

  it('reports, and never writes, a note whose file document is missing or nameless', () => {
    expect(planNoteMigration({ hasAttachment: true, attachmentFileName: 'x.pdf' }, null)).toMatchObject({
      action: 'missing-file',
    });
    expect(planNoteMigration({ hasAttachment: true }, { size: 5 })).toMatchObject({ action: 'missing-file' });
  });

  it('is idempotent: applying the update makes the note "already"', () => {
    const note = { hasAttachment: true, attachmentFileName: 'x.pdf' };
    const plan = planNoteMigration(note, file);
    if (plan.action !== 'migrate') throw new Error('expected migrate');
    expect(planNoteMigration({ ...note, ...plan.update }, file)).toEqual({ action: 'already' });
  });
});

describe('legacyFieldsToDrop', () => {
  it('lists the old fields only on a note that already has the list', () => {
    const note = { attachments: [], attachmentFileName: 'x', attachmentSize: 1 };
    expect(legacyFieldsToDrop(note)).toEqual(['attachmentFileName', 'attachmentSize']);
    expect(LEGACY_FIELDS).toEqual(['attachmentFileName', 'attachmentMimeType', 'attachmentSize']);
  });

  it('never drops them from a note that has not been migrated (the file would lose its name)', () => {
    expect(legacyFieldsToDrop({ hasAttachment: true, attachmentFileName: 'x' })).toEqual([]);
  });

  it('has nothing to drop once they are gone', () => {
    expect(legacyFieldsToDrop({ attachments: [] })).toEqual([]);
  });
});

describe('tally', () => {
  it('counts each outcome', () => {
    expect(tally(['migrate', 'migrate', 'already', 'no-file', 'missing-file', 'dropLegacy'])).toEqual({
      migrate: 2,
      already: 1,
      'no-file': 1,
      'missing-file': 1,
      dropLegacy: 1,
    });
  });
});

describe('the script', () => {
  it('is a dry run unless --live is given, and writes only behind that flag', () => {
    expect(script).toContain("if (arg === '--live') opts.live = true;");
    expect(script).toMatch(/const opts = \{[^}]*\blive: false,/);
    expect(script.match(/opts\.live = true/g)).toHaveLength(1);
    expect(script).not.toMatch(/live: true/);
    expect(script).toContain('if (opts.live) await noteDoc.ref.update(plan.update);');
  });

  it('never touches updatedAt, and reads only the file’s metadata, not its body', () => {
    expect(script).not.toMatch(/updatedAt\s*:/); // the header comment may mention it; no write sets it
    expect(script).toContain("fieldMask: ['fileName', 'mimeType', 'size']");
  });

  it('drops the old fields only with --drop-legacy, and only with --live', () => {
    expect(script).toContain('if (opts.dropLegacy) {');
    expect(script).toContain('if (opts.live) {\n              await noteDoc.ref.update(Object.fromEntries(drop.map((f) => [f, FieldValue.delete()])));');
  });

  it('limits a run to one institution when asked, with a safe id', () => {
    expect(script).toContain("else if (arg.startsWith('--institution=')) opts.institution");
    expect(script).toContain('/^[A-Za-z0-9_-]{1,64}$/.test(opts.institution)');
  });

  it('logs ids and outcomes, never file names', () => {
    const log = script.slice(script.indexOf('log.push('), script.indexOf('log.push(') + 400);
    expect(log).not.toContain('fileName');
  });
});
