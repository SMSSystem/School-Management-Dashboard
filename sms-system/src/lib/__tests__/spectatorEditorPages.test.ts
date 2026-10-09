import { describe, expect, it } from 'vitest';

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
const source = (rel: string) => {
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
  const writers = Object.entries(files)
    .filter(([, src]) => WRITE_CALL.test(src))
    .map(([key]) => key.slice(PREFIX.length))
    .sort();

  it('lists exactly the pages that call a write function', () => {
    expect(writers).toEqual(Object.keys(CLASSIFIED).sort());
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
