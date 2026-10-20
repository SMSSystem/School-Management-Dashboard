import { describe, expect, it } from 'vitest';
import formRaw from '../../components/forms/LessonNoteForm.tsx?raw';
import viewRaw from '../../components/forms/LessonNoteViewModal.tsx?raw';
import listRaw from '../../scenes/(dashboard)/list/lesson-notes/index.tsx?raw';
import rulesRaw from '../../../firestore.rules?raw';

// Several files per lesson note, optional links, and the three-line view header
// (docs/miscellaneous-specs/LESSON_NOTES_FEATURE_SPEC.md amendment). There is no
// component test harness here, so this reads the sources as text.

const lf = (s: string) => s.split('\r\n').join('\n');
const form = lf(formRaw);
const view = lf(viewRaw);
const list = lf(listRaw);
const rules = lf(rulesRaw);

describe('LessonNoteForm: several files', () => {
  it('lets the person pick several files and caps the count at the shared limit', () => {
    expect(form).toContain('<input\n                type="file"\n                multiple');
    expect(form).toContain('MAX_LESSON_NOTE_FILES');
    expect(form).toContain('fileCount < MAX_LESSON_NOTE_FILES');
  });

  it('checks the count and total for every file chosen, before keeping it', () => {
    expect(form).toContain('validateAddedFile([...keptExisting, ...added, ...accepted], processed)');
    expect(form.indexOf('validateAddedFile(')).toBeLessThan(form.indexOf('accepted.push('));
  });

  it('removes one file at a time, kept or new', () => {
    expect(form).toContain('setKeptIds((prev) => prev.filter((id) => id !== f.id))');
    expect(form).toContain('setAdded((prev) => prev.filter((x) => x.id !== f.id))');
  });

  it('writes the note’s metadata list and id list, in both create and update', () => {
    expect((form.match(/attachments,\n/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((form.match(/attachmentIds: plan\.attachmentIds,/g) ?? []).length).toBe(2);
    expect((form.match(/hasAttachment: attachments\.length > 0,/g) ?? []).length).toBe(2);
  });

  it('drops the single-file fields as an older note is saved, and never writes them on create', () => {
    expect(form).toContain('attachmentFileName: deleteField(),');
    expect(form).toContain('attachmentMimeType: deleteField(),');
    expect(form).toContain('attachmentSize: deleteField(),');
    const create = form.slice(form.indexOf('if (type === "create") {'), form.indexOf('} else {\n            const id = updateId as string;'));
    expect(create).not.toContain('attachmentFileName');
  });

  it('writes new file documents and deletes removed ones in the same batch as the note', () => {
    const batchStart = form.indexOf('const batch = writeBatch(db);');
    const sets = form.indexOf('batch.set(doc(noteRef, "attachment", file.id)');
    const deletes = form.indexOf('plan.deleteIds.forEach((fileId) => batch.delete(doc(noteRef, "attachment", fileId)));');
    const commit = form.indexOf('await batch.commit();');
    expect(batchStart).toBeLessThan(sets);
    expect(sets).toBeLessThan(commit);
    expect(deletes).toBeGreaterThan(sets);
    expect(deletes).toBeLessThan(commit);
  });
});

describe('LessonNoteForm: links and files are both optional', () => {
  it('no longer requires a file or a link', () => {
    expect(form).not.toContain('Add a file or at least one link.');
    expect(form).not.toContain('resourceLinks.length === 0');
  });

  it('still validates the links it is given', () => {
    expect(form).toContain('validateLessonNoteLinks(links)');
    expect(form).toContain('cleanLessonNoteLinks(links)');
  });

  it('the rules accept a note with neither', () => {
    expect(rules).not.toContain('d.hasAttachment == true || d.resourceLinks.size() > 0');
  });
});

describe('LessonNoteViewModal', () => {
  it('shows class, subject/course and the teacher on three lines, each only when it has a value', () => {
    expect(view).toContain('{ label: noteClassIds(note).length > 1 ? "Classes" : "Class", value: classLabel(note) },');
    expect(view).toContain('{ label: "Subject/Course", value: note.subjectName },');
    expect(view).toContain('{ label: "Overseen by", value: note.teacherName },');
    expect(view).toContain('].filter((d) => d.value);');
    expect(view).toContain('· {d.label}: {d.value}');
  });

  it('no longer joins them on one line', () => {
    expect(view).not.toContain('.join(" · ")');
  });

  it('lists every file with its own Download, fetching only the one clicked', () => {
    expect(view).toContain('const files = noteFiles(note);');
    expect(view).toContain('files.map((file) =>');
    expect(view).toContain('onClick={() => download(file.id)}');
    expect(view).toContain('downloadLessonNoteAttachment(institutionId, note.id, fileId)');
  });
});

describe('lesson notes list', () => {
  it('shows a file icon with a count for several files, and the names on hover', () => {
    expect(list).toContain('noteFiles(item).length > 0');
    expect(list).toContain('noteFiles(item).map((f) => f.fileName).join(", ")');
    expect(list).toContain('noteFiles(item).length > 1 ? noteFiles(item).length : null');
  });
});
