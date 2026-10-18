import { describe, expect, it } from 'vitest';
import academicCalendarSaveSrc from '../academicCalendarSave.ts?raw';
import generalAttendanceSaveSrc from '../generalAttendanceSave.ts?raw';
import gradebookSaveSrc from '../gradebookSave.ts?raw';
import importStudentsCommitSrc from '../importStudentsCommit.ts?raw';
import studentDetailSaveSrc from '../studentDetailSave.ts?raw';

// Phase 4 batch C (docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md): every
// dashboard page that calls a Firestore write function must be classified here,
// with the guard that keeps a spectator from reaching it or from seeing its write
// controls. A new page that writes fails the first test until it is classified,
// so a spectator can never silently get a page whose Save button is not hidden.
// The guards are checked as text, like the other spectator guards.

// The parentheses in the folder name are glob syntax, so they are escaped.
const files = import.meta.glob('../../scenes/\\(dashboard\\)/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const PREFIX = '../../scenes/(dashboard)/';

// Pages split into several files of their own folder: their guards are checked on the folder's joined text.
const SPLIT_PAGES = ['institution-profile/index.tsx', 'list/students/[id]/index.tsx', 'academic-calendar/index.tsx', 'attendance/general/index.tsx', 'list/gradebook/index.tsx', 'import/index.tsx'];

// Pages whose Firestore writes moved out of the page into a lib file. Each is still classified (and its
// write controls still checked) as a page that writes; the lib file is checked below to really write.
const MOVED_WRITERS: Record<string, { file: string; src: string }> = {
  'list/students/[id]/index.tsx': { file: 'lib/studentDetailSave.ts', src: studentDetailSaveSrc },
  'academic-calendar/index.tsx': { file: 'lib/academicCalendarSave.ts', src: academicCalendarSaveSrc },
  'attendance/general/index.tsx': { file: 'lib/generalAttendanceSave.ts', src: generalAttendanceSaveSrc },
  'list/gradebook/index.tsx': { file: 'lib/gradebookSave.ts', src: gradebookSaveSrc },
  'import/index.tsx': { file: 'lib/importStudentsCommit.ts', src: importStudentsCommitSrc },
};

const source = (rel: string) => {
  if (SPLIT_PAGES.includes(rel)) {
    const folder = PREFIX + rel.slice(0, rel.lastIndexOf('/') + 1);
    const parts = Object.keys(files)
      .filter((key) => key.startsWith(folder))
      .sort()
      .map((key) => files[key]);
    expect(parts.length, `missing files in ${folder}`).toBeGreaterThan(0);
    return parts.join('\n');
  }
  const src = files[PREFIX + rel];
  expect(src, `missing file ${rel}`).toBeTypeOf('string');
  return src;
};

const WRITE_CALL = /\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction)\s*\(/;

type Classified = { why: string; guards: RegExp[] };

// Pages a spectator cannot open: App.tsx redirects them (see appRoutesSpectator.test.ts).
const redirected = (why: string): Classified => ({ why, guards: [] });

const CLASSIFIED: Record<string, Classified> = {
  // Not reachable by a spectator
  'admin/backfill-student-classes/index.tsx': redirected('route redirects a spectator'),
  'import/index.tsx': redirected('route redirects a spectator'),
  'settings/index.tsx': redirected('route redirects a spectator (appRoutesSpectator.test.ts)'),

  // Self-service writes only (the owner's own profile fields)
  'profile/index.tsx': {
    why: 'own profile; rules allow a spectator no field here beyond the self-service ones',
    guards: [/canEditContactInfo = currentRole === "super_admin"/],
  },

  // Reachable, read-only for a spectator
  'academic-calendar/index.tsx': {
    why: 'wizards, term edits, non-school days and the automatic next-year draft need mayEdit',
    guards: [
      /const mayEdit = canManage\(role\);/,
      /if \(!mayEdit \|\| USE_MOCK \|\| !activeYear/, // the draft is written on view, so it is guarded
      /mayEdit \? <CustomTimeBlockWizard/,
      /if \(!mayEdit && !activeYear\) return <CalendarNotSetUp \/>/,
      /\{mayEdit && \(\s*<button\s+id=\{`tour-academic-calendar-term-/,
      /\{mayEdit && \(\s*<button id="tour-academic-calendar-nsd-add"/,
      /\{mayEdit && \(\s*<button\s+id=\{`tour-academic-calendar-nsd-toggle-/,
    ],
  },
  'admin/grade-entry-tracking/index.tsx': {
    why: 'renaming a period saves to the term',
    guards: [/const mayEdit = canManage\(role\);/, /\{mayEdit && selectedPeriod && !isEditingLabel/, /\{mayEdit && selectedPeriod && isEditingLabel/],
  },
  'attendance/general/index.tsx': {
    why: 'cell buttons, fill and save controls are hidden when viewOnly',
    guards: [/const viewOnly = isReadOnly \|\| !canWrite\(role\);/, /\{viewOnly \? \(/, /\{!viewOnly && effectiveClassId && students\.length > 0 && populatedSessions/, /\{!viewOnly && effectiveClassId && students\.length > 0 && \(/],
  },
  'attendance/subject/index.tsx': {
    why: 'cell buttons, fill and save controls are hidden when viewOnly',
    guards: [/const viewOnly = isReadOnly \|\| !canWrite\(role\);/, /\{viewOnly \? \(/, /\{!viewOnly && dateISO <= today/, /\{!viewOnly && enrolledStudents\.length > 0/],
  },
  'institution-profile/index.tsx': {
    why: 'a non-admin gets the read-only InstitutionInfoDisplay',
    guards: [/if \(role !== 'institution_admin'\) \{\s*return \(\s*<div[^>]*>\s*<InstitutionInfoDisplay \/>/],
  },
  'list/classes/[id]/index.tsx': {
    why: 'adding and removing a student needs institution_admin (the add panel and the remove buttons)',
    guards: [/const isAdmin = role === "institution_admin";/, /\{isAdmin && DATA_MODE === "live" && id && <AddStudentPanel/, /\{isAdmin && additional && \(/],
  },
  'list/gradebook/index.tsx': {
    why: 'save, add-column and edit-column controls need canWrite; cells are editable only when canEdit',
    guards: [/const showEditControls = role !== "super_admin" && canWrite\(role\);/, /async function performSave\(\) \{\s*if \(!canEdit \|\|/, /const canEdit =\s*\(role === "institution_admin" \|\|\s*role === "senior_teacher" \|\|\s*role === "regular_teacher"\)/],
  },
  'list/gradebook/ColumnCreationModal.tsx': {
    why: 'opened only from the gradebook\'s add-column button, which needs canWrite',
    guards: [],
  },
  'list/houses/index.tsx': {
    why: 'edit and delete controls need institution_admin',
    guards: [/role === "institution_admin" &&/],
  },
  'list/houses/[id]/index.tsx': {
    why: 'edit and Manage Students controls need institution_admin',
    guards: [/role === "institution_admin" && \(\s*<FormModal/, /role === "institution_admin" && \(\s*<button/],
  },
  'list/students/[id]/index.tsx': {
    why: 'links, activities, positions and comments need mayEdit (spectatorPages.test.ts)',
    guards: [/const mayEdit = role === "institution_admin";/],
  },
  'registrations/index.tsx': {
    why: 'status changes, conversion and the on-open duplicate flag need mayEdit',
    guards: [
      /const mayEdit = canManage\(role\);/,
      /if \(!mayEdit \|\| !institutionId \|\| institutionId === "\*" \|\| registrations\.length === 0\) return;/, // written on view
      /\{mayEdit && selected\.status === "pending"/,
      /\{mayEdit && canTransition && \(\s*<button\s+onClick=\{\(\) => setConvertOpen\(true\)\}/,
      /\{mayEdit && canTransition && \(\s*<button\s+onClick=\{\(\) => transition\(selected, "rejected"\)\}/,
      /\{mayEdit && selected\.status === "rejected"/,
      /\{mayEdit && convertOpen && selected && institutionId && \(/,
    ],
  },
  'registrations/ConvertToAccountsPanel.tsx': {
    why: 'mounted only behind mayEdit && convertOpen in registrations/index.tsx',
    guards: [],
  },
  'report-card-comments/index.tsx': {
    why: 'comment boxes are read-only and Save is hidden without mayEdit',
    guards: [/const mayEdit = canManage\(role\);/, /readOnly=\{!mayEdit\}/, /\{mayEdit && \(\s*<div className="flex items-center gap-3 justify-end/],
  },
  'report-cards/index.tsx': {
    why: 'generate and re-generate need isAdmin (institution_admin only)',
    guards: [/const isAdmin = role === "institution_admin";/, /\{showPanel && isAdmin && \(/],
  },
  'schedule/index.tsx': {
    why: 'the schedule-access toggle panel is institution_admin only',
    guards: [/role === 'institution_admin' && \(/],
  },
};

describe('every dashboard page that writes is classified for the spectator', () => {
  const writers = [
    ...Object.entries(files)
      .filter(([, src]) => WRITE_CALL.test(src))
      .map(([key]) => key.slice(PREFIX.length)),
    ...Object.keys(MOVED_WRITERS),
  ].sort();

  it('lists exactly the pages that call a write function', () => {
    expect(writers).toEqual(Object.keys(CLASSIFIED).sort());
  });

  it.each(Object.entries(MOVED_WRITERS))('%s: its writes live in a lib file that really writes', (rel, { file, src }) => {
    expect(src, `${rel} points at ${file}, which no longer calls a write function`).toMatch(WRITE_CALL);
    expect(files[PREFIX + rel], `${rel} must not call a write function itself any more (remove it from MOVED_WRITERS)`).not.toMatch(WRITE_CALL);
  });

  it.each(Object.entries(CLASSIFIED))('%s is guarded', (rel, { guards }) => {
    const src = source(rel);
    for (const g of guards) expect(src, `${rel}: ${g}`).toMatch(g);
  });
});

describe('a spectator reaches no page that writes without a guard', () => {
  it('has a documented reason for every classified page', () => {
    for (const [rel, { why }] of Object.entries(CLASSIFIED)) {
      expect(why.length, rel).toBeGreaterThan(10);
    }
  });
});
