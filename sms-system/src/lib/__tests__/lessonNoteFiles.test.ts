import { describe, expect, it } from 'vitest';
import {
  LEGACY_FILE_ID,
  MAX_LESSON_NOTE_FILES,
  MAX_LESSON_NOTE_TOTAL_BYTES,
  addedFilesMessage,
  blobLookupIds,
  fileMeterLabel,
  fileMeterPercent,
  fileMetadata,
  filesLabel,
  newLessonNoteFileId,
  noteFiles,
  planFileChanges,
  uploadProgressLabel,
  validateAddedFile,
} from '../lessonNoteFiles';

const MB = 1024 * 1024;
const f = (id: string, size = 1000) => ({ id, fileName: `${id}.pdf`, mimeType: 'application/pdf', size });

describe('noteFiles', () => {
  it('lists the files of a note in the new shape, in order', () => {
    const attachments = [f('b'), f('a')];
    expect(noteFiles({ hasAttachment: true, attachments })).toEqual(attachments);
  });

  it('an empty list means no files, even when a legacy name is left over', () => {
    expect(noteFiles({ hasAttachment: false, attachments: [], attachmentFileName: 'old.pdf' })).toEqual([]);
  });

  it('reads a note written before several files as one file with the legacy id', () => {
    expect(
      noteFiles({ hasAttachment: true, attachmentFileName: 'old.pdf', attachmentMimeType: 'application/pdf', attachmentSize: 5 }),
    ).toEqual([{ id: LEGACY_FILE_ID, fileName: 'old.pdf', mimeType: 'application/pdf', size: 5 }]);
    expect(noteFiles({ hasAttachment: true, attachmentFileName: 'old.pdf' })[0]).toMatchObject({ mimeType: '', size: 0 });
  });

  it('has no files when it has no attachment', () => {
    expect(noteFiles({ hasAttachment: false })).toEqual([]);
    expect(noteFiles({ hasAttachment: true })).toEqual([]); // no name to list
  });
});

describe('validateAddedFile', () => {
  it('allows files up to the count and total limits', () => {
    expect(MAX_LESSON_NOTE_FILES).toBe(12);
    expect(validateAddedFile([], { size: 5 * MB })).toBeNull();
    expect(validateAddedFile([f('a', 5 * MB), f('b', 5 * MB)], { size: 5 * MB })).toBeNull(); // exactly 15MB
  });

  it('refuses a thirteenth file', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => f(`file-${i}`, 10));
    expect(validateAddedFile(twelve.slice(0, 11), { size: 10 })).toBeNull();
    expect(validateAddedFile(twelve, { size: 10 })).toMatch(/at most 12 files/);
  });

  it('refuses a file that takes the total over 15MB, by one byte', () => {
    expect(MAX_LESSON_NOTE_TOTAL_BYTES).toBe(15 * MB);
    expect(validateAddedFile([f('a', 5 * MB), f('b', 5 * MB)], { size: 5 * MB + 1 })).toMatch(/15MB/);
  });
});

describe('planFileChanges', () => {
  it('keeps the kept files in their order, then the new ones, and lists what to write and delete', () => {
    expect(
      planFileChanges({ existingIds: ['a', 'b', 'c'], keptIds: ['c', 'a'], addedIds: ['x', 'y'] }),
    ).toEqual({ setIds: ['x', 'y'], deleteIds: ['b'], attachmentIds: ['a', 'c', 'x', 'y'] });
  });

  it('a create has nothing to delete', () => {
    expect(planFileChanges({ existingIds: [], keptIds: [], addedIds: ['x'] })).toEqual({
      setIds: ['x'],
      deleteIds: [],
      attachmentIds: ['x'],
    });
  });

  it('removing every file deletes them all and leaves an empty list', () => {
    expect(planFileChanges({ existingIds: ['a', 'b'], keptIds: [], addedIds: [] })).toEqual({
      setIds: [],
      deleteIds: ['a', 'b'],
      attachmentIds: [],
    });
  });

  it('ignores a kept id that is not an existing file', () => {
    expect(planFileChanges({ existingIds: ['a'], keptIds: ['a', 'zzz'], addedIds: [] }).attachmentIds).toEqual(['a']);
  });
});

describe('the form meter', () => {
  it('reads files, size and the share of the total used', () => {
    expect(fileMeterLabel(4, 6.2 * MB)).toBe('4 of 12 files · 6.2 MB of 15 MB (41% used)');
  });

  it('is correct when empty, part-way and full', () => {
    expect(fileMeterPercent(0)).toBe(0);
    expect(fileMeterPercent(7.5 * MB)).toBe(50);
    expect(fileMeterPercent(15 * MB)).toBe(100);
    expect(fileMeterLabel(12, 15 * MB)).toBe('12 of 12 files · 15.0 MB of 15 MB (100% used)');
  });

  it('never reads over 100%, for a note written past the total around the form', () => {
    expect(fileMeterPercent(25 * MB)).toBe(100);
  });
});

describe('uploadProgressLabel', () => {
  it('counts the files finished, starting from none', () => {
    expect(uploadProgressLabel(0, 9)).toBe('Uploading 0 of 9 (0%)');
    expect(uploadProgressLabel(3, 9)).toBe('Uploading 3 of 9 (33%)');
    expect(uploadProgressLabel(9, 9)).toBe('Uploading 9 of 9 (100%)');
  });
});

describe('addedFilesMessage', () => {
  const COUNT = 'A note can have at most 12 files.';
  const TYPE = 'File must be a PDF.';

  it('says nothing when every file was added', () => {
    expect(addedFilesMessage(3, [])).toBeNull();
  });

  it('keeps the plain reason for one file refused on its own', () => {
    expect(addedFilesMessage(0, [{ fileName: 'a.pdf', reason: 'File must be 5MB or smaller.' }])).toBe('File must be 5MB or smaller.');
  });

  it('names what was left out, and how many went in', () => {
    expect(addedFilesMessage(2, [{ fileName: 'a.pdf', reason: COUNT }, { fileName: 'b.pdf', reason: COUNT }])).toBe(
      'Added 2 files. Not added: a.pdf, b.pdf (a note can have at most 12 files).',
    );
    expect(addedFilesMessage(1, [{ fileName: 'a.pdf', reason: COUNT }])).toBe('Added 1 file. Not added: a.pdf (a note can have at most 12 files).');
  });

  it('groups by reason, and leaves out "Added" when none went in', () => {
    expect(addedFilesMessage(0, [{ fileName: 'a.pdf', reason: COUNT }, { fileName: 'b.exe', reason: TYPE }])).toBe(
      'Not added: a.pdf (a note can have at most 12 files). Not added: b.exe (file must be a PDF).',
    );
  });
});

describe('blobLookupIds', () => {
  const INLINE_LIMIT = 500 * 1024;
  const files = [f('small', 1000), f('edge', INLINE_LIMIT), f('large', INLINE_LIMIT + 1), f('unknown', 0)];

  it('skips files known to be inline, and looks up large and unknown sizes', () => {
    expect(blobLookupIds(files, ['small', 'edge', 'large', 'unknown'])).toEqual(['large', 'unknown']);
  });

  it('looks up an id with no metadata, and only the ids asked for', () => {
    expect(blobLookupIds(files, ['data'])).toEqual(['data']);
    expect(blobLookupIds(files, ['small'])).toEqual([]);
  });
});

describe('small helpers', () => {
  it('fileMetadata keeps only the listed fields', () => {
    expect(fileMetadata({ ...f('a'), dataUrl: 'x' } as never)).toEqual(f('a'));
  });

  it('filesLabel names one file and counts several', () => {
    expect(filesLabel([])).toBe('');
    expect(filesLabel([f('a')])).toBe('a.pdf');
    expect(filesLabel([f('a'), f('b')])).toBe('2 files');
  });

  it('new ids are distinct and fit the rules’ id pattern', () => {
    const a = newLessonNoteFileId();
    expect(a).not.toBe(newLessonNoteFileId());
    expect(a).toMatch(/^[A-Za-z0-9-]{1,40}$/);
    expect(LEGACY_FILE_ID).toMatch(/^[A-Za-z0-9-]{1,40}$/);
  });
});
