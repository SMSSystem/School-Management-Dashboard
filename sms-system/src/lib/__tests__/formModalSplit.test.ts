import { describe, expect, it } from 'vitest';
import { collectionNameFor, deleteDialogFor, FLAT_TABLES, TABLE_LABELS, type TableName } from '../formTables';
import registryRaw from '../../components/formRegistry.tsx?raw';
import formModalRaw from '../../components/FormModal.tsx?raw';
import deleteRecordRaw from '../deleteRecord.ts?raw';

// components/FormModal.tsx was one 408-line file: a registry of 20 lazy forms written out twice, the table names and
// labels, the Delete wording as nested ternaries and the Delete flow inside an onClick. It is now the dialog
// (FormModal.tsx), the registry (components/formRegistry.tsx), the tables and the Delete wording as data
// (lib/formTables.ts) and what Delete does (lib/deleteRecord.ts). These pin that nothing was lost on the way: the
// Delete dialog's wording is compared with the strings the old JSX held, and every table that had a form still has one.

const lf = (s: string) => s.split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const registry = lf(registryRaw);
const formModal = lf(formModalRaw);
const deleteRecord = lf(deleteRecordRaw);

const TABLES_WITH_A_FORM: TableName[] = [
  'institution_admin', 'teacher', 'student', 'subject', 'class', 'lesson', 'exam', 'assignment', 'result', 'event',
  'announcement', 'parent', 'term', 'feedback_comment', 'department', 'timetable_slot', 'house', 'disciplinary_action',
  'rubric', 'lesson_note',
];

describe('the Delete dialog wording', () => {
  it('is what the dialog said before, table by table', () => {
    expect(deleteDialogFor('subject')).toEqual({
      heading: 'Confirm Deletion',
      paragraphs: [
        'All data related to this subject will be lost.',
        'Deleting this subject will prevent teachers assigned to it from editing any results or feedback comments that reference it.',
      ],
      cancelLabel: 'No, cancel',
      confirmLabel: 'Yes, delete',
    });
    expect(deleteDialogFor('disciplinary_action').message).toBe('This will permanently remove this disciplinary record.');
    expect(deleteDialogFor('progress_report').message).toBe('This will permanently remove this progress report snapshot.');
    expect(deleteDialogFor('lesson_note').message).toBe('This will permanently remove this lesson note and its attached file.');
    expect(deleteDialogFor('rubric').message).toBe(
      "Any assignment still referencing this rubric will show it as missing rather than error — rubric references aren't automatically cleaned up.",
    );
  });

  it('says "All data will be lost" with the raw table name for every other table, and only the subject has a heading and a cancel button', () => {
    for (const table of ['class', 'exam', 'assignment', 'result', 'term', 'department', 'house', 'feedback_comment', 'timetable_slot'] as TableName[]) {
      const d = deleteDialogFor(table);
      expect(d.message, table).toBe(`All data will be lost. Are you sure you want to delete this ${table}?`);
      expect(d.confirmLabel, table).toBe('Delete');
      expect(d.heading, table).toBeUndefined();
      expect(d.cancelLabel, table).toBeUndefined();
    }
  });
});

describe('the tables', () => {
  it('map to the collections they always did', () => {
    expect(collectionNameFor('institution_admin')).toBe('users');
    expect(collectionNameFor('class')).toBe('classes');
    expect(collectionNameFor('lesson_note')).toBe('lessonNotes');
    expect(collectionNameFor('disciplinary_action')).toBe('disciplinaryActions');
    expect(collectionNameFor('progress_report')).toBe('progressReports');
    expect(collectionNameFor('exam')).toBe('exams');
    expect(collectionNameFor('feedback_comment')).toBe('feedback_comments');
  });

  it('keep the flat tables and the button labels', () => {
    expect([...FLAT_TABLES].sort()).toEqual(['attendance', 'institution_admin', 'parent', 'student', 'teacher']);
    expect(TABLE_LABELS.feedback_comment).toBe('feedback comment');
    expect(TABLE_LABELS.lesson_note).toBe('lesson note');
  });
});

describe('the registry', () => {
  it('has a form, or a placeholder, for every table that had one', () => {
    const loaders = [...registry.matchAll(/^ {2}(\w+): \(\) => import\("\.\/forms\/(\w+)"\),$/gm)].map((m) => m[1]);
    const placeholders = [...registry.matchAll(/^ {2}(\w+): "(\w+)",$/gm)].map((m) => m[1]).filter((t) => ['lesson', 'event', 'announcement'].includes(t));
    expect([...loaders, ...placeholders].sort()).toEqual([...TABLES_WITH_A_FORM].sort());
  });

  it('loads each form from a file that exists, with a literal path so the bundler still makes a chunk of it', () => {
    const files = Object.keys(import.meta.glob('../../components/forms/*.tsx'));
    const paths = [...registry.matchAll(/import\("\.\/forms\/(\w+)"\)/g)].map((m) => m[1]);
    expect(paths.length).toBe(17);
    for (const name of paths) expect(files.some((f) => f.endsWith(`/${name}.tsx`)), name).toBe(true);
  });

  it('makes each lazy component once, at module level', () => {
    expect(registry).toContain('Object.entries(LOADERS).map(([table, load]) => [table, lazy(load!)])');
    expect(registry).not.toContain('React.lazy');
  });
});

describe('the dialog', () => {
  it('delegates the form and the delete to the new modules and keeps its own close handling', () => {
    expect(formModal).toContain('renderForm(table, type, data, closeModal) ?? "Form not found!"');
    expect(formModal).toContain('await deleteRecord(table, institutionId!, String(id), user ? { uid: user.uid, name: displayName ?? "" } : undefined);');
    expect(formModal).toContain('"Failed to delete. Please try again."');
    expect(formModal).toContain('if (USERS_QUERY_TABLES.has(table)) {');
    expect(formModal).toContain('if (REFERENCE_QUERY_TABLES.has(table)) {');
    expect(formModal).not.toContain('React.lazy');
    expect(formModal).not.toContain('writeBatch');
  });

  it('runs the per-table cleanup in the same order as before, with the class last', () => {
    const order = ['table === "lesson_note"', 'table === "subject"', 'table === "assignment"', 'table === "class"', 'const ref = FLAT_TABLES.has(table)'].map((t) => deleteRecord.indexOf(t));
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
