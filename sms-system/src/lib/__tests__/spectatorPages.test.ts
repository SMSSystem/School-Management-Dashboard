import { describe, expect, it } from 'vitest';
import { inactivityTimeoutMs, STAFF_INACTIVITY_MS } from '../inactivityTimeout';
import auditLog from '../../scenes/(dashboard)/admin/audit-log/index.tsx?raw';
import lessonNotesHook from '../../hooks/useLessonNotes.ts?raw';
import profileAudit from '../../components/profile/ProfileAuditSection.tsx?raw';
import profileActivity from '../../components/profile/ProfileActivitySection.tsx?raw';
import results from '../../scenes/(dashboard)/list/results/index.tsx?raw';
import assignmentsList from '../../scenes/(dashboard)/list/assignments/index.tsx?raw';
import assignmentDetail from '../../scenes/(dashboard)/list/assignments/[id]/index.tsx?raw';
import lessonNotesPage from '../../scenes/(dashboard)/list/lesson-notes/index.tsx?raw';
import disciplinary from '../../scenes/(dashboard)/disciplinary-actions/index.tsx?raw';
import reportCards from '../../scenes/(dashboard)/report-cards/index.tsx?raw';
import studentDetail from '../../scenes/(dashboard)/list/students/[id]/index.tsx?raw';
import rubrics from '../../scenes/(dashboard)/list/rubrics/index.tsx?raw';

// Page-level checks for the spectator role (docs/miscellaneous-specs/
// SPECTATOR_ROLE_SPEC.md, Phase 4). The source-reading checks follow the same
// approach as appRoutesSpectator.test.ts: they fail if a later edit takes a
// spectator out of a view it should have, or into one it should not.

describe('spectator and the inactivity timeout', () => {
  it('gets the short staff window, because it reads personal data', () => {
    expect(inactivityTimeoutMs('spectator')).toBe(STAFF_INACTIVITY_MS);
  });
});

describe('audit log page', () => {
  it('treats a spectator like an institution admin: its own institution only', () => {
    expect(auditLog).toContain('const isInstitutionScoped = role === "institution_admin" || role === "spectator";');
    expect(auditLog).not.toContain('isInstitutionAdmin');
  });

  it('never offers the all-institutions picker or collection-group query to the scoped roles', () => {
    // The nested per-institution path is used whenever isInstitutionScoped is true.
    expect(auditLog).toMatch(/isInstitutionScoped\s*\?\s*institutionCollection\(institutionId!, "audit_log"\)/);
  });

  it('makes no writes', () => {
    expect(/\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch)\s*\(/.test(auditLog)).toBe(false);
  });
});

describe('lesson notes hook', () => {
  it('lets a spectator read the whole collection, as an admin does', () => {
    expect(lessonNotesHook).toContain('if (hasAdminView(role)) {');
    expect(lessonNotesHook).toContain("from '@/lib/roleCapabilities'");
  });
});

describe('profile sections', () => {
  it('keeps the security events section for admins only (a spectator sees nothing)', () => {
    expect(profileAudit).toContain('if (role !== "institution_admin" && role !== "super_admin") return null;');
  });

  it('does not list the spectator among the staff who perform recordable actions', () => {
    expect(profileActivity).toMatch(/const STAFF_ROLES: Role\[\] = \["super_admin", "institution_admin", "senior_teacher", "regular_teacher"\];/);
    expect(profileActivity).not.toContain('spectator');
  });
});

// Batch B: list and detail pages. A spectator sees what an institution admin
// sees; every write control stays keyed to a role a spectator does not have.
describe('batch B: list and detail pages', () => {
  it('results: a spectator gets the class filters and the results, not the write controls', () => {
    expect(results).toContain('const isStaff = hasStaffView(role);');
    // create / edit / delete are still keyed to roles, never to isStaff
    expect(results).toContain('role === "institution_admin" || role === "super_admin" || role === "regular_teacher" || role === "senior_teacher"');
    expect(results).not.toMatch(/isStaff\s*&&\s*<FormModal/);
  });

  it('assignments: a spectator reads the unfiltered list', () => {
    expect(assignmentsList).toContain('if (!hasAdminView(role)) return;');
  });

  it('assignment detail: a spectator sees the roster and grades but cannot grade, edit or convert', () => {
    expect(assignmentDetail).toContain('const canViewRoster = (role: Role | null) => hasStaffView(role);');
    expect(assignmentDetail).toMatch(/!canViewRoster\(role\)/);
    expect(assignmentDetail).toMatch(/\{canViewRoster\(role\) \? \(\s*<div[^>]*>\s*<h2[^>]*>Class Roster/);
    // grading, edit and convert controls stay behind canEditAssignment
    expect(assignmentDetail).toMatch(/submission && canEditAssignment\(role\) && \(\s*<button/);
    expect(assignmentDetail).toMatch(/\{canEditAssignment\(role\) && \(\s*<div className="flex items-center gap-2">\s*\{assignment\.gradingMode === "standalone"/);
  });

  it('lesson notes page: the staff heading for a spectator, with no write control', () => {
    expect(lessonNotesPage).toContain('isStaff || role === "spectator" ? "Lesson Notes"');
    expect(lessonNotesPage).toContain('{isStaff && <FormModal table="lesson_note" type="create" />}');
  });

  it('disciplinary actions: a spectator sees every record, but only writers see add and the actions column', () => {
    expect(disciplinary).toContain('const isStaff = hasStaffView(role);');
    expect(disciplinary).toContain('const mayWrite = canWrite(role);');
    expect(disciplinary).toContain('{mayWrite && <FormModal table="disciplinary_action" type="create" />}');
    expect(disciplinary).toContain('columns={mayWrite ? staffColumns : readOnlyColumns}');
    expect(disciplinary).not.toMatch(/isStaff\s*&&\s*<FormModal/);
  });

  it('report cards: a spectator gets Export, but not generate or re-generate', () => {
    expect(reportCards).toMatch(/\{\(isAdmin \|\| role === "spectator"\) && \(\s*<ExportMenu/);
    expect(reportCards).toContain('const isAdmin = role === "institution_admin";');
    expect(reportCards).toMatch(/\{isAdmin && \(\s*<button\s+onClick=\{\(\) => handleRegenerate\(item\)\}/);
  });

  it('student detail: a spectator sees the linked parents, activities, positions and comments read-only', () => {
    expect(studentDetail).toContain('const mayEdit = role === "institution_admin";');
    expect(studentDetail).toContain('const showAdminSections = role === "institution_admin" || role === "spectator";');
    expect(studentDetail).not.toContain('role === "institution_admin" && selectedTermId');
    expect((studentDetail.match(/showAdminSections && selectedTermId/g) ?? []).length).toBe(3);
    expect(studentDetail).toContain('readOnly={!mayEdit}');
    // each write control sits behind mayEdit
    for (const handler of ['handleUnlinkParent', 'handleDeleteActivity', 'handleDeleteResponsibility']) {
      expect(studentDetail, handler).toMatch(new RegExp(String.raw`mayEdit && \(\s*<button\s+onClick=\{\(\) => ${handler}`));
    }
    expect(studentDetail).toMatch(/mayEdit && allParents\.filter\(/);
    expect(studentDetail).toMatch(/mayEdit && \(\s*<div className="flex gap-2 items-center pt-1">\s*<input\s+type="text"\s+autoComplete="off"\s+value=\{activityName\}/);
    expect(studentDetail).toMatch(/mayEdit && \(\s*<div className="flex flex-col gap-2 pt-1">\s*<input\s+type="text"\s+autoComplete="off"\s+value=\{responsibilityTitle\}/);
    expect(studentDetail).toMatch(/mayEdit && \(\s*<div className="flex items-center gap-3 justify-end pt-1 border-t/);
    expect(studentDetail).toMatch(/\{canWrite\(role\) && \(\s*<FormModal\s+table="disciplinary_action"\s+type="create"/);
  });

  it('rubrics: management stays with writers, a spectator only views', () => {
    expect(rubrics).not.toContain('spectator');
  });
});
