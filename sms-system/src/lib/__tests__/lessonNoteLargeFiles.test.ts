import { describe, expect, it } from 'vitest';
import formRaw from '../../components/forms/LessonNoteForm.tsx?raw';
import modalRaw from '../../components/FormModal.tsx?raw';
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
    expect(form).toContain('{uploadLimitLabel(uploadPolicy)} max.');
    expect(form).not.toContain('500KB max');
    expect(form).toContain('formatFileSize(newAttachment.size)');
  });

  it('saves through commitWithBlob so a large file is uploaded before the note is written', () => {
    expect(form).toContain('await commitWithBlob(');
    expect(at(form, 'await commitWithBlob(')).toBeLessThan(at(form, 'const batch = writeBatch(db);'));
    expect(form).toContain('async (blobKey) => {');
    expect(form).toContain('setUploading,');
  });

  it('writes the file record with attachmentData (a key OR the body), never the body directly', () => {
    expect(form).toContain('attachmentData(newAttachment, blobKey)');
    expect(form).not.toContain('dataUrl: newAttachment.dataUrl');
    expect((form.match(/attachmentData\(newAttachment, blobKey\)/g) ?? []).length).toBe(2); // create + update
  });

  it('reads the old file key BEFORE the save and removes the old file only AFTER it', () => {
    const readKey = at(form, 'await existingBlobKey(institutionId, updateId as string)');
    const save = at(form, 'await commitWithBlob(');
    const removeOld = at(form, 'void deleteBlob(institutionId, oldBlobKey)');
    expect(readKey).toBeLessThan(save);
    expect(save).toBeLessThan(removeOld);
    // only when an existing file is replaced or removed
    expect(form).toContain('type === "update" && hadAttachment && (newAttachment || removeExisting)');
  });

  it('closes the dialog only after the old file is dealt with, and tells the user to wait', () => {
    expect(at(form, 'void deleteBlob(institutionId, oldBlobKey)')).toBeLessThan(at(form, 'onClose?.();'));
    expect(form).toContain('Uploading the file… keep this window open until it finishes.');
    expect(form).toContain('{uploading ? "Uploading file…"');
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

  it('reads the large file key first, deletes the records, then the file', () => {
    const read = block.indexOf('await existingBlobKey(institutionId!, String(id))');
    const commit = block.indexOf('await batch.commit();');
    const remove = block.indexOf('void deleteBlob(institutionId!, blobKey)');
    expect(read).toBeGreaterThan(-1);
    expect(read).toBeLessThan(commit);
    expect(commit).toBeLessThan(remove);
  });

  it('still deletes the attachment record and the note in one batch', () => {
    expect(block).toContain('batch.delete(doc(noteRef, "attachment", "data"));');
    expect(block).toContain('batch.delete(noteRef);');
  });
});

describe('opening a lesson note file', () => {
  it('the view dialog shows human-readable sizes and a wait hint for large files', () => {
    expect(view).toContain('formatFileSize(note.attachmentSize)');
    expect(view).toContain('needsBlobStore(note.attachmentSize)');
    expect(view).not.toContain('Math.round(note.attachmentSize / 1024)');
  });

  it('the download fetches by key on demand, otherwise the embedded body', () => {
    expect(download).toContain('file.blobKey ? await getBlobDataUrl(institutionId, file.blobKey) : file.dataUrl');
    expect(download).not.toContain('useQuery');
  });
});
