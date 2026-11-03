import { describe, expect, it } from 'vitest';
import formRaw from '../../components/forms/LessonNoteForm.tsx?raw';
import { formModalSource as modalRaw } from './formModalSource';
import viewRaw from '../../components/forms/LessonNoteViewModal.tsx?raw';
import downloadRaw from '../lessonNoteAttachment.ts?raw';

// Phase 4 of docs/miscellaneous-specs/LARGE_ATTACHMENTS_RTDB_SPEC.md: the lesson
// note form, the delete flow and the view dialog use the large-file store. There
// is no component test harness here, so this reads the sources as text and pins
// the order of operations the design depends on (upload first, remove the old
// file only after the save, never keep a key and a body together). It cannot
// prove a real upload.

const lf = (s: string) => s.split('\r\n').join('\n');
const form = lf(formRaw);
const modal = lf(modalRaw);
const view = lf(viewRaw);
const download = lf(downloadRaw);

const at = (src: string, needle: string): number => {
  const i = src.indexOf(needle);
  expect(i, `${needle} not found`).toBeGreaterThan(-1);
  return i;
};

describe('LessonNoteForm', () => {
  it('lets only teacher and admin roles go past 500KB (policy from the role)', () => {
    expect(form).toContain('const uploadPolicy = largeUploadPolicy(role);');
    expect(form).toContain('processDocumentUpload(file, { large: uploadPolicy })');
  });

  it('shows the real limit and sizes instead of a fixed "500KB max"', () => {
    expect(form).toContain('{uploadLimitLabel(uploadPolicy)} max each');
    expect(form).not.toContain('500KB max');
    expect(form).toContain('formatFileSize(file.size)');
  });

  it('saves through commitWithBlobs so large files are uploaded before the note is written', () => {
    expect(form).toContain('await commitWithBlobs(');
    expect(at(form, 'await commitWithBlobs(')).toBeLessThan(at(form, 'const batch = writeBatch(db);'));
    expect(form).toContain('async (blobKeys) => {');
    expect(form).toContain('setUploading,');
  });

  it('writes each file record with attachmentData (a key OR the body), never the body directly', () => {
    expect(form).toContain('attachmentData(file, blobKeys[i])');
    expect(form).not.toContain('dataUrl: file.dataUrl');
    expect((form.match(/attachmentData\(/g) ?? []).length).toBe(1); // one loop covers create and update
  });

  it('reads the removed files’ keys BEFORE the save and removes those files only AFTER it', () => {
    const readKeys = at(form, 'await existingBlobKeys(institutionId, updateId as string, lookupIds)');
    const save = at(form, 'await commitWithBlobs(');
    const removeOld = at(form, 'void deleteBlobs(institutionId, Object.values(oldBlobKeys))');
    expect(readKeys).toBeLessThan(save);
    expect(save).toBeLessThan(removeOld);
    // only for a removed or replaced file that can have a key
    expect(form).toContain('blobLookupIds(existingFiles, plan.deleteIds)');
    expect(form).toContain('type === "update" && lookupIds.length > 0');
  });

  it('never starts its file deletes in parallel, since they would refuse each other', () => {
    expect(form).not.toContain('void deleteBlob(');
  });

  it('closes the dialog only after the removed files are dealt with, and tells the user to wait', () => {
    expect(at(form, 'void deleteBlobs(institutionId, Object.values(oldBlobKeys))')).toBeLessThan(at(form, 'onClose?.();'));
    expect(form).toContain('Uploading the files… keep this window open until it finishes.');
    expect(form).toContain('{uploading ? "Uploading files…"');
  });

  it('still keeps the note, its file record and its audit entry in one batch', () => {
    const start = at(form, 'const batch = writeBatch(db);');
    const commit = at(form, 'await batch.commit();');
    const audit = at(form, 'eventType: "lesson_note_edit"');
    expect(start).toBeLessThan(audit);
    expect(audit).toBeLessThan(commit);
  });
});

describe('deleting a lesson note (FormModal)', () => {
  const block = (() => {
    const a = modal.indexOf('if (table === "lesson_note") {');
    expect(a).toBeGreaterThan(-1);
    return modal.slice(a, modal.indexOf('const ref = FLAT_TABLES', a));
  })();

  it('reads the large file keys first, deletes the records, then the files', () => {
    const read = block.indexOf('await noteFileDocs(institutionId, id)');
    const commit = block.indexOf('await batch.commit();');
    const remove = block.indexOf('void deleteBlobs(institutionId, files.flatMap(');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(commit);
    expect(commit).toBeLessThan(remove);
    expect(block).not.toContain('void deleteBlob(institutionId, f.blobKey)'); // overlapping deletes refuse each other
  });

  it('deletes every file record and the note in one batch', () => {
    expect(block).toContain('files.forEach((f) => batch.delete(doc(noteRef, "attachment", f.id)));');
    expect(block).not.toContain('"attachment", "data"');
    expect(block).toContain('batch.delete(noteRef);');
  });
});

describe('opening a lesson note file', () => {
  it('the view dialog shows human-readable sizes and a wait hint for large files', () => {
    expect(view).toContain('formatFileSize(file.size)');
    expect(view).toContain('needsBlobStore(file.size)');
    expect(view).not.toContain('Math.round(file.size / 1024)');
  });

  it('the download fetches by key on demand, otherwise the embedded body', () => {
    expect(download).toContain('file.blobKey ? await getBlobDataUrl(institutionId, file.blobKey, file.size) : file.dataUrl');
    expect(download).not.toContain('useQuery');
  });

  it('the download reads the one file document asked for', () => {
    expect(download).toContain("'attachment', fileId");
    expect(download).toContain('fileId: string = LEGACY_FILE_ID');
  });
});
