# Known Issues — School Management Dashboard

> **Purpose:** Tracked issues that are real but deliberately _not_ fixed inline where found — either because the fix has a larger blast radius than the change that surfaced them, or because the right fix requires a product decision this document doesn't own. Each entry should carry enough context that whoever picks it up doesn't have to re-derive the investigation.
> **Format:** One `##` section per issue. Update in place (add a "Status" line) rather than deleting resolved entries — keep a short resolution note so the history isn't lost.

---

## 1. `results` collection's read rule is broader than its write rules

> **Status:** Open — needs a product decision (see "Remediation options" below) before any code changes.
> **Discovered:** 2026-09-06, during senior-dev review of the `spreadsheet-export` branch's Results-page export feature.
> **Severity:** Low in practice at current scale (small pilot, small teaching staffs per institution); worth fixing before a larger/more adversarial-minded customer base.

### The issue

`firestore.rules:398`:

```
match /results/{resultId} {
  allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
    || resource.data.studentId == request.auth.uid
    || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)));
  ...
```

`isTeacherOrAbove()` (`firestore.rules:42`) is `isAdminOrAbove() || isTeacher()` — true for `senior_teacher` and `regular_teacher` regardless of which class, subject, or department they're actually assigned to. So **any teacher in an institution can read any result in that institution**, not just results for classes/subjects they teach.

This is inconsistent with the same collection's `allow create`/`allow update` rules (`firestore.rules:402-422`), which correctly scope `regular_teacher` to `request.auth.uid in get(subjects/{subjectId}).data.teacherIds` and `senior_teacher` to `isSeniorTeacherFor(departmentId)`. Reads are strictly broader than writes on the same collection.

### Why this matters now (and didn't get fixed inline)

Not a new problem — the Results page's own on-screen staff query already relies on this same broad rule, with the UI's `visibleClasses`/`visibleSubjects` lists (scoped to the viewer's own assignments) being the only practical narrowing. This document exists because the `spreadsheet-export` branch adds a bulk CSV/XLSX export to that same page (`src/scenes/(dashboard)/list/results/index.tsx`'s `handleExportResults`), which makes extracting that over-permitted data trivially easy compared to paging through the UI — a good forcing function to finally address it, even though the export feature itself doesn't introduce or worsen the underlying gap.

### Why the obvious fix doesn't work

The natural fix — mirror the create/update rules' scoping onto `allow read` — breaks a currently-working feature. Specifically:

```
allow read: if (isAdminOrAbove() && sameInstitution(resource.data.institutionId))
  || (myRole() == 'senior_teacher' && isSeniorTeacherFor(resource.data.departmentId))
  || (myRole() == 'regular_teacher' && request.auth.uid in get(/databases/$(database)/documents/subjects/$(resource.data.subjectId)).data.teacherIds)
  || resource.data.studentId == request.auth.uid
  || (isParent() && exists(...));
```

Firestore evaluates security rules for a **list/query** operation by requiring _every_ document the query would return to individually satisfy the rule — there is no partial filtering; if even one candidate document fails the check, the _entire query_ is rejected with a permission-denied error, not just that one document silently dropped.

Every staff read of `results` in this codebase can legitimately run with `subjectId` **unfiltered** — "All Subjects" is a normal, working query state, not an edge case:

- `src/scenes/(dashboard)/list/results/index.tsx` — the staff filter row's Subject dropdown defaults to (and can always be reset to) "All Subjects"; `subjectId` is an optional `where()` clause.
- `src/scenes/(dashboard)/list/gradebook/index.tsx` (two read sites, ~line 422 and ~line 516) — always filters by `subjectId`, so these specific reads _would_ be safe under the tightened rule; included here for completeness of the audit, not as an affected call site.

The problem case is specifically the Results page's "All Subjects" state for a class that spans multiple subjects/departments:

- A `regular_teacher` viewing "All Subjects" for a class they partially teach (e.g. they teach Math in that class, a colleague teaches English) would have the query rejected outright, because some returned documents' `subjectId` wouldn't be in their own `teacherIds`.
- A `senior_teacher` viewing "All Subjects" for their own homeroom class would have the same problem whenever that class includes subjects outside their own department (a very common case — a homeroom typically has subjects taught across several departments) — `isSeniorTeacherFor(resource.data.departmentId)` only covers their one department.

So the naive fix doesn't narrow _unauthorized_ access — it breaks _authorized, currently-working_ access, because Firestore has no concept of "return only the subset of this query's results I'm allowed to see."

### Remediation options considered

1. **Accept the current scope, do nothing.** Lowest effort, leaves the gap open. Reasonable at current pilot scale (small teaching staffs, low adversarial risk) but should be revisited before onboarding larger institutions.
2. **Tighten the rule and narrow "All Subjects."** Change the Subject filter so "All Subjects" only ever means "all subjects _I teach_" for `regular_teacher`, and either drop the option or scope it to the viewer's own department for `senior_teacher`. This is a real, disclosed UX change (removes the ability to see a cross-department view of one's own homeroom class's results in one screen), not just a security fix — needs product sign-off, not just an engineering decision.
3. **Redesign "All Subjects" as N per-subject queries, merged client-side.** Preserves today's UX (a teacher can still see every subject in their class(es)) while allowing the rule to tighten, by issuing one query per subject the viewer is actually scoped to (each individually satisfying a tightened rule) and merging results in the client. Real scope increase — touches the Results page's query logic and Gradebook's read sites, adds N reads instead of 1 per view (cost tradeoff to weigh against `MISCELLANEOUS_INFO.md`'s free-tier analysis), and needs its own design pass before implementation.

No option was implemented as part of this document — this is a tracking entry, not a fix. Whoever picks this up should start by getting a product decision between options 2 and 3 (or explicitly choosing option 1 for now) before writing any rule or query changes.
