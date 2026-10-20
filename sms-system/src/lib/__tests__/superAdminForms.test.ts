import { describe, expect, it } from 'vitest';
import { assignmentFormSource as assignmentFormRaw } from './assignmentFormSource';

// A super_admin has no single institution: AuthContext gives them the sentinel institutionId "*", and
// lib/paths.ts's institutionCollection()/institutionSubcollection() throw for it on purpose, so a path
// is never built from "*". On 2026-10-17 a sweep of the production bundle opened "Add new assignment"
// as the QA super_admin: the form's rubric effect (guarded only by `!institutionId`) called
// institutionCollection("*", "rubrics"), which threw, and the page error card replaced the page.
// These pin the guards on the form's two institution-scoped reads.

const norm = (s: string) => s.split('\r\n').join('\n');
const assignmentForm = norm(assignmentFormRaw);

describe('the assignment form for a super_admin ("*")', () => {
  it('does not read the rubrics of "*"', () => {
    expect(assignmentForm).toContain('if (!institutionId || institutionId === "*") return;\n    getDocs(institutionCollection(institutionId, "rubrics"))');
  });

  it('does not read the gradebook columns of "*"', () => {
    expect(assignmentForm).toContain(
      'if (!institutionId || institutionId === "*" || !gradebookId || watchedGradingMode !== "gradebook") {',
    );
  });

  it('has no institutionCollection() or institutionSubcollection() call that only checks `!institutionId`', () => {
    // Every effect that builds a path from institutionId must also rule out "*": find an effect whose
    // guard is the bare `if (!institutionId) return;` and that calls one of the path builders.
    const effects = assignmentForm.split('useEffect(() => {').slice(1);
    const unguarded = effects.filter(
      (body) =>
        /if \(!institutionId\) return;/.test(body.slice(0, 200)) &&
        /institution(Sub)?[Cc]ollection\(institutionId/.test(body.slice(0, 600)),
    );
    expect(unguarded).toHaveLength(0);
  });
});
