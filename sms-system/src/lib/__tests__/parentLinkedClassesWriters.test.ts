import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// A parent's `linkedClassIds` must follow every change to their links and their children's classes
// (src/lib/parentLinkedClasses.ts): if it does not, the file rule refuses a parent a file their child should have. So a
// file that writes either must use the helper, or be listed below with its reason. A new writer fails here until someone
// decides. This reads the sources as text, so it finds who writes, not whether a save works: that is
// rules-tests/parentLinkedClassesClient.rules.test.ts.

const SRC = join(__dirname, '..', '..');
const sources = (readdirSync(SRC, { recursive: true }) as string[])
  .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))
  .map((f) => ({ path: relative(SRC, join(SRC, f)).split('\\').join('/'), text: readFileSync(join(SRC, f), 'utf8') }));

const usesHelper = (text: string) => /addParentClassUpdates|\blinkParent\(/.test(text);

// `classIds: x.classIds` in a write. Most of these also go through classPopulationDelta.
const CLASS_WRITE = /\bclassIds:\s*\w+\.classIds\b/;
const CLASSES_EXEMPT: Record<string, string> = {
  'lib/classDeletion.ts': 'deleting a class leaves the lists to the repair script: it would cost several reads per student',
  'lib/createUserDocument.ts': 'a new student has no links yet',
  'lib/createUserAccount.ts': 'a new student has no links yet',
  'lib/importStudentsCommit.ts': 'an imported student has no links yet',
  // These match the pattern but only copy the value when reading.
  'components/BigCalender.tsx': 'reads only',
  'lib/gradeTrackingLoader.ts': 'reads only',
  'lib/subjectFormLogic.ts': 'reads only, and of a subject',
};

const LINK_WRITE = /doc\(db,\s*["']student_parents["']/;
const LINKS_EXEMPT: Record<string, string> = {};

describe('everything that changes a student’s classes keeps the parents’ lists', () => {
  const writers = sources.filter((s) => CLASS_WRITE.test(s.text));

  it('finds the writers it should', () => {
    expect(writers.map((w) => w.path)).toEqual(expect.arrayContaining(['components/forms/StudentForm.tsx', 'lib/classDeletion.ts', 'scenes/(dashboard)/list/classes/[id]/index.tsx']));
  });

  for (const { path, text } of writers) {
    it(path, () => {
      expect(usesHelper(text) || path in CLASSES_EXEMPT, `${path} writes classIds without updating parents' lists`).toBe(true);
    });
  }
});

describe('everything that changes a link keeps the parent’s list', () => {
  const writers = sources.filter((s) => LINK_WRITE.test(s.text));

  it('finds the writers it should', () => {
    expect(writers.map((w) => w.path)).toEqual(expect.arrayContaining(['components/forms/ParentForm.tsx', 'lib/studentDetailSave.ts']));
  });

  for (const { path, text } of writers) {
    it(path, () => {
      expect(usesHelper(text) || path in LINKS_EXEMPT, `${path} writes a link without updating the parent's list`).toBe(true);
    });
  }

  it('deleting a student updates their parents, and registration conversion links through the helper', () => {
    expect(sources.find((s) => s.path === 'lib/deleteUserExecutor.ts')?.text).toContain('addParentClassUpdates(');
    expect(sources.find((s) => s.path === 'scenes/(dashboard)/registrations/ConvertToAccountsPanel.tsx')?.text).toContain('linkParent(');
  });
});
