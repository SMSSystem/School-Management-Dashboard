import { describe, expect, it } from 'vitest';
import {
  LEGACY_FILE_ID,
  MAX_LESSON_NOTE_FILES,
  MAX_LESSON_NOTE_TOTAL_BYTES,
  fileMetadata,
  filesLabel,
  newLessonNoteFileId,
  noteFiles,
  planFileChanges,
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
    expect(MAX_LESSON_NOTE_FILES).toBe(5);
    expect(validateAddedFile([], { size: 5 * MB })).toBeNull();
    expect(validateAddedFile([f('a', 5 * MB), f('b', 5 * MB)], { size: 5 * MB })).toBeNull(); // exactly 15MB
  });

  it('refuses a sixth file', () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map((id) => f(id, 10));
    expect(validateAddedFile(five.slice(0, 4), { size: 10 })).toBeNull();
    expect(validateAddedFile(five, { size: 10 })).toMatch(/at most 5 files/);
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
