# Report Generation — Prerequisites & Design Decisions

> **Created:** 2026-05-29
> **Branch:** `mvp`
> **Status:** Pre-implementation analysis. No code changes have been made.
> **Scope:** Everything that must be resolved or built before report generation (A-3) can be implemented.

Cross-references: [`PROJECT_SPEC_AND_ANALYSIS.md`](./PROJECT_SPEC_AND_ANALYSIS.md) · [`ROLE_PRIVILEGE_ANALYSIS.md`](./ROLE_PRIVILEGE_ANALYSIS.md) · [`firebase-rules.md`](./firebase-rules.md) · [`ISSUES_AND_GAPS.md`](./ISSUES_AND_GAPS.md)

---

## Table of Contents

1. [Feature Specification](#1-feature-specification)
2. [Design Decisions](#2-design-decisions)
   - [Role Access](#21-role-access)
   - [Grades Data Model](#22-grades-data-model)
   - [UI Housing](#23-ui-housing)
3. [Prerequisite Dependency Chain](#3-prerequisite-dependency-chain)
4. [New Items Not in Existing Backlog](#4-new-items-not-in-existing-backlog)
5. [Firestore Collections Required](#5-firestore-collections-required)
   - [feedback_comments](#51-feedback_comments)
   - [reports](#52-reports)
6. [Firestore Rules Required](#6-firestore-rules-required)
7. [Recommended Build Order](#7-recommended-build-order)
8. [Open Questions — Resolved](#8-open-questions--resolved)

---

## 1. Feature Specification

From [`PROJECT_SPEC_AND_ANALYSIS.md`](./PROJECT_SPEC_AND_ANALYSIS.md) §1.8:

> Reports are generated on demand. The system pulls every grade (`results`) for the student in the selected term, plus every feedback comment (`feedback_comments`) submitted by that student's teachers for the same term.

```
Teacher submits feedback
  └── stored against (studentId + teacherId + classId + termId)

Institution admin or senior teacher generates report for a student+term
  └── System pulls:
        ├── all results for that studentId in that termId (all classes, full term)
        └── all feedback_comments for that studentId in that termId
              └── Report viewable by: super_admin (all), institution_admin (institution),
                                      senior_teacher (dept), regular_teacher (class),
                                      student (own), parent (child's)
```

**Current status:** Neither `feedback_comments` nor `reports` has a schema, Firestore rules, or any UI. See [`ISSUES_AND_GAPS.md`](./ISSUES_AND_GAPS.md) issues #19 and #20.

---

## 2. Design Decisions

The following decisions were made during the pre-implementation analysis session on 2026-05-29. They resolve three previously open questions.

### 2.1 Role Access

**Decision:** `institution_admin` and `senior_teacher` can generate reports. All other roles are read-only.

This **aligns with the original spec** (§1.8), which stated institution admins can view and re-generate any report. See the note in §2.1.1 below.

| Action | super_admin | institution_admin | senior_teacher | regular_teacher | student | parent |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Generate (write to `reports`) | ❌ | ✅ institution | ✅ dept scope | ❌ | ❌ | ❌ |
| View (read from `reports`) | ✅ all | ✅ institution | ✅ dept scope | ✅ class scope | ✅ own only | ✅ child's |

**Generate scope definitions:**

| Role | Can generate for… |
|---|---|
| `institution_admin` | Any student in their institution |
| `senior_teacher` | Any student in any class within their department (`isSeniorTeacherFor`) |

#### 2.1.1 Note — Admin Re-generation Restored

The original spec (§1.8) stated institution admins could view and re-generate any report across the school. An earlier design decision removed this access; it has since been **restored** (2026-05-30). `institution_admin` is now a first-class generator alongside `senior_teacher`. Students and `regular_teacher` do not generate reports under this design.

---

### 2.2 Grades Data Model

**Decision:** The platform must support both flat (single score) and weighted (multi-component) grading systems, configurable per institution. Report generation branches on which system is active.

This resolves **Open Question #2** from [`PROJECT_SPEC_AND_ANALYSIS.md`](./PROJECT_SPEC_AND_ANALYSIS.md) §1.11 and directly governs the D-5 schema rebuild.

#### Flat mode

Each result record holds one score against one assessment event. Report aggregation averages `score / maxScore` across all results for the student in the term.

```
results/{id}
  studentId
  teacherId
  classId
  termId
  assessmentName    // e.g. "Midterm Exam"
  score             // e.g. 78
  maxScore          // e.g. 100
  institutionId
  // weight absent → flat mode
```

#### Weighted mode

Each result record includes a weight (0–1). Report aggregation computes `Σ(score / maxScore × weight)` across all results for the student in the term. Weights per class should sum to 1.0 — this is enforced at the application layer, not in Firestore rules.

```
results/{id}
  studentId
  teacherId
  classId
  termId
  assessmentName    // e.g. "Final Exam"
  score             // e.g. 85
  maxScore          // e.g. 100
  weight            // e.g. 0.40  ← present → weighted mode
  institutionId
```

#### Grading configuration mechanism

A `gradingSystem` field must exist somewhere in the data model so the report generation logic knows which aggregation to use. **The placement of this field must be decided before D-5 can be built.**

| Option | Field location | Trade-off |
|---|---|---|
| **Institution-level** | `institutions/{id}.gradingSystem` | Simplest. All classes in the institution use the same system. Less flexible. |
| **Class-level** | `classes/{id}.gradingSystem` | More flexible — different classes can use different systems. Adds a field to the class CRUD form (D-4). |

> **Resolved (2026-05-31): Institution-level.** `gradingSystem` lives on the `institutions/{id}` document. The grading config UI is a dropdown on the institution admin settings page. All classes in the institution share the same grading system. D-5 schema work can now proceed.

Report documents should snapshot the `gradingSystem` value at generation time so that a retrospective re-view reflects the grading logic that was active when the report was produced.

---

### 2.3 UI Housing

**Decision:** A single dedicated `/reports` page, role-scoped.

- No new route structure complexity — one route, one page component.
- Admins see all reports across their institution with student and term filters.
- Students see only their own reports.
- Parents see their linked child's reports.
- Teachers (regular and senior) see reports for the students within their scope.
- The generate button is visible only to `institution_admin` and `senior_teacher`.

**Sidebar link:** A "Reports" entry will need to be added to [`src/components/Menu.tsx`](../src/components/Menu.tsx) for all six roles once the page is built.

---

## 3. Prerequisite Dependency Chain

The following tree shows every item that must be built before report generation (A-3) is possible. Items from the existing build backlog use their original IDs; new items introduced by this analysis are marked **[NEW]**.

```
A-3: Report Generation
├── D-5: Results data model rebuild
│   ├── F-1: Terms management UI
│   └── [NEW] Grading config design ✅ Resolved — institution-level
│       └── [NEW] Grading config UI (institution admin settings page)
└── A-2: feedback_comments collection + teacher submission UI
    ├── F-1: Terms management UI
    ├── D-1: Teacher CRUD forms → Firestore
    ├── D-2: Student CRUD forms → Firestore
    └── D-4: Class CRUD forms → Firestore
        └── F-1: Terms management UI
```

**Summary table:**

| ID | Item | Depends on | Location | Status |
|---|---|---|---|---|
| F-1 | Terms management UI | — | New route + page | ❌ Not built |
| D-1 | Teacher CRUD → Firestore | — | [`src/components/forms/TeacherForm.tsx`](../src/components/forms/TeacherForm.tsx) | ❌ Not built |
| D-2 | Student CRUD → Firestore | — | [`src/components/forms/StudentForm.tsx`](../src/components/forms/StudentForm.tsx) | ❌ Not built |
| D-4 | Class CRUD → Firestore | F-1 | Class form (new or existing) | ❌ Not built |
| D-5 | Results model rebuild (`termId`, `assessmentName`, `maxScore`, `weight?`) | F-1, grading config decision | [`src/lib/data.ts`](../src/lib/data.ts) + results form | ❌ Not built |
| **[NEW]** | Grading config design decision | — | Design only (no code) | ✅ Resolved — institution-level |
| **[NEW]** | Grading config UI | Grading config decision | Institution admin settings page | ❌ Not built |
| A-2 | `feedback_comments` collection + teacher submission UI | D-1, D-2, D-4, F-1 | New collection + new UI | ❌ Not built |
| A-3 | Report generation logic + `/reports` page | D-5, A-2 | New page + new collection | ❌ Not built |

> **F-1 is the single highest-priority unblocking item.** It is the only item with no dependencies and it gates every other item in this chain. See [`ISSUES_AND_GAPS.md`](./ISSUES_AND_GAPS.md) §23.

---

## 4. New Items Not in Existing Backlog

The following items were identified during this analysis and do not appear in the existing backlog in [`PROJECT_SPEC_AND_ANALYSIS.md`](./PROJECT_SPEC_AND_ANALYSIS.md) §4.1.

### N-1: Grading configuration design decision

Before D-5 can be built, the placement of the `gradingSystem` configuration field must be decided (institution document vs. class document). This is a design decision with no code work, but it directly governs the D-5 schema and which UI surface the setting is exposed on.

**Blocks:** D-5, Grading config UI (N-2).

### N-2: Grading configuration UI

Institution admins need a way to set the `gradingSystem` value (`'flat'` or `'weighted'`) for their institution or per class. This is likely:

- A field in the institution admin settings page, if institution-level — see [`SETTINGS_PAGE_ANALYSIS.md`](./SETTINGS_PAGE_ANALYSIS.md)
- A field in the class creation/edit form, if class-level — part of D-4

**Blocks:** A-3 (report generation cannot produce meaningful output without knowing which system to use).

### N-3: `feedback_comments` Firestore security rules

No rules exist for `feedback_comments`. These must be written and published to the Firebase Console before A-2 can be tested in live mode. See §6 for the proposed ruleset.

### N-4: `reports` Firestore security rules

No rules exist for `reports`. These must be written and published to the Firebase Console before A-3 can be tested in live mode. The teacher write conditions are non-trivial and deviate from anything already in the published rules. See §6 for the proposed ruleset.

### N-5: `/reports` page and sidebar link

A new page component at `src/scenes/(dashboard)/reports/index.tsx` and a new route registration in [`src/App.tsx`](../src/App.tsx). A "Reports" menu entry must also be added to [`src/components/Menu.tsx`](../src/components/Menu.tsx) for all six roles.

---

## 5. Firestore Collections Required

### 5.1 `feedback_comments`

**Status:** No schema, no rules, no UI. See [`ISSUES_AND_GAPS.md`](./ISSUES_AND_GAPS.md) §19.

```
feedback_comments/{docId}   // auto-generated ID
  studentId      string     // links to students/{studentId}
  teacherId      string     // links to teachers/{teacherId} / users/{uid}
  classId        string     // links to classes/{classId}
  termId         string     // links to terms/{termId}
  institutionId  string     // multi-tenancy scoping
  departmentId   string     // links to departments/{departmentId} — required by isSeniorTeacherFor() rule
  comment        string     // written feedback text
  createdAt      string     // ISO 8601 timestamp
```

**Composite key for uniqueness:** `studentId + teacherId + classId + termId`. Application layer should enforce one comment per teacher per student per class per term (upsert rather than append).

**Who writes:** `regular_teacher` (for their class students), `senior_teacher` (for any class in their department), `institution_admin` and `super_admin` (any).

**Who reads:** Same write-eligible roles plus `student` (own), `parent` (linked child's), `super_admin`.

---

### 5.2 `reports`

**Status:** No schema, no rules, no UI. See [`ISSUES_AND_GAPS.md`](./ISSUES_AND_GAPS.md) §20.

```
reports/{docId}             // auto-generated ID
  studentId        string   // links to students/{studentId}
  termId           string   // links to terms/{termId}
  institutionId    string   // multi-tenancy scoping
  generatedAt      string   // ISO 8601 timestamp
  generatedBy      string   // uid of the user who triggered generation
  generatedByRole  string   // role of the generator (audit trail)
  gradingSystem    string   // snapshot: 'flat' | 'weighted' — locked at generation time
  departmentId     string?  // present when generated by senior_teacher; absent for institution_admin-generated reports
  grades           array    // snapshot of results records for this student+term (all classes, full term)
  feedback         array    // snapshot of feedback_comments for this student+term (all classes, full term)
  overallScore     number   // computed at generation time (flat: avg %; weighted: Σ(score/max×weight))
```

> **Snapshot vs. live query:** Reports are stored as snapshots. Generation reads current `results` and `feedback_comments`, computes the output, and writes it as a document. Subsequent views read the stored document — they do not re-query. This means a report reflects the data as it existed at generation time and is not affected by later grade edits. If a grade is corrected post-generation, the report must be re-generated by an eligible role.

---

## 6. Firestore Rules Required

Both collections require new rules to be published in the Firebase Console. Neither collection is yet referenced in [`firebase-rules.md`](./firebase-rules.md).

### 6.1 `feedback_comments`

```
match /feedback_comments/{docId} {
  allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
    || resource.data.studentId == request.auth.uid
    || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)));

  allow create: if writingToMyInstitution()
    && (isAdminOrAbove()
      || isClassTeacherFor(request.resource.data.classId)
      || isSeniorTeacherFor(request.resource.data.departmentId));

  allow update: if sameInstitution(resource.data.institutionId)
    && (isAdminOrAbove()
      || (isTeacher() && resource.data.teacherId == request.auth.uid)
      || isSeniorTeacherFor(resource.data.departmentId))
    && institutionNotChanged();

  allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
}
```

> **Note:** `departmentId` has been added to the schema (§5.1, updated 2026-05-31) and is required at write time for `isSeniorTeacherFor` to resolve on create and update. Rules published to [`firebase-rules.md`](./firebase-rules.md) — **publish to Firebase Console to take effect in live mode.**

### 6.2 `reports`

```
match /reports/{docId} {
  allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
    || resource.data.studentId == request.auth.uid
    || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)));

  // Institution admins generate for any student in their institution.
  // Senior teachers generate for students within their department scope.
  // Students and regular_teacher do not generate.
  allow create: if writingToMyInstitution()
    && (isAdmin()
      || isSeniorTeacherFor(request.resource.data.departmentId));

  // Re-generation: same conditions as create, applied on update.
  allow update: if sameInstitution(resource.data.institutionId)
    && (isAdmin()
      || isSeniorTeacherFor(resource.data.departmentId))
    && institutionNotChanged();

  allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
}
```

> **Note on `departmentId` in reports:** When a `senior_teacher` generates a report, the document must include `departmentId` at write time so `isSeniorTeacherFor` can resolve correctly on re-generation. For `institution_admin`-generated reports, `departmentId` is absent — the `isAdmin()` branch does not require it. Reports are term-wide; a `senior_teacher`-generated report will include grades and feedback from all of the student's classes, including those outside the teacher's department. This is intentional.

---

## 7. Recommended Build Order

Items within the same tier have no mutual dependencies and can be built in parallel or in any order.

| Tier | ID | Item | Notes |
|---|---|---|---|
| 1 | N-1 | Grading config placement — **✅ Resolved: institution-level (2026-05-31)** | `gradingSystem` on `institutions/{id}` document. Grading config UI on institution admin settings page. Tier 2 unblocked. |
| 2 | F-1 | Terms management UI | Highest-priority code task. Unblocks D-4, D-5, A-2. |
| 2 | D-1 | Teacher CRUD → Firestore | Can run in parallel with F-1. Unblocks A-2. |
| 2 | D-2 | Student CRUD → Firestore | Can run in parallel with F-1. Unblocks A-2. |
| 3 | D-4 | Class CRUD → Firestore | Depends on F-1 for `termId` on class documents. Grading config is institution-level — N-2 is independent of D-4. |
| 3 | N-2 | Grading config UI — **✅ Built (2026-05-31)** | Institution-level dropdown in settings page. Requires `institutions` update rule expanded to allow `institution_admin` (N-2b) — publish to Firebase Console. |
| 4 | D-5 | Results data model rebuild | Depends on F-1 and N-1. Add `termId`, `assessmentName`, `maxScore`, `weight?` to schema, mock data, and results form. |
| 4 | N-3 | Publish `feedback_comments` Firestore rules — **✅ Rules drafted (2026-05-31)** | Schema fixed (`departmentId` added to §5.1). Rules added to [`firebase-rules.md`](./firebase-rules.md). **Publish to Firebase Console to enable live mode.** |
| 5 | A-2 | `feedback_comments` collection + teacher submission UI | Depends on D-1, D-2, D-4, F-1. Requires N-3 for live mode testing. |
| 6 | N-4 | Publish `reports` Firestore rules — **✅ Rules drafted (2026-05-31)** | Rules added to [`firebase-rules.md`](./firebase-rules.md). **Publish to Firebase Console to enable live mode.** |
| 7 | A-3 | Report generation logic | Depends on D-5 and A-2. Core join: `results` + `feedback_comments` for `studentId + termId`, aggregated per grading system config. |
| 7 | N-5 | `/reports` page + sidebar link | Can be scaffolded (route + skeleton) any time after N-5 is registered; generation logic wired in after A-3. |

---

## 8. Open Questions — Resolved

| # | Question (from spec) | Resolution |
|---|---|---|
| **OQ-2** | Grades: flat single score or weighted multi-component? | **Both.** The platform supports either system, configurable per institution or per class (placement TBD — see N-1). The `results` schema includes an optional `weight` field; report aggregation branches on its presence. |
| **OQ-3** | Reports: PDF export or in-app view only? | **Deferred.** In-app view only for the initial implementation (A-3). PDF export (A-5) remains a future item and does not block A-3. |

| # | Question (new, raised during this analysis) | Status |
|---|---|---|
| **N-1** | Should grading config (`gradingSystem: 'flat' \| 'weighted'`) live on the institution document or the class document? | **Resolved — institution-level (2026-05-31).** `gradingSystem` lives on the `institutions/{id}` document. Grading config UI is a dropdown on the institution admin settings page. All classes share the same system. |
| **N-6** | Should a `reports` document be scoped to a single class or to all classes for a student in a term? | **Resolved — term-wide (2026-05-30).** Reports cover all of a student's results and feedback across all classes for the selected term. No `classId` field on `reports` documents. Resolved by the role access decision: `institution_admin` and `senior_teacher` are the generators; neither role is class-scoped. |

---

*End of prerequisites analysis. All design decisions resolved — N-1: institution-level grading config (2026-05-31); N-6: term-wide reports (2026-05-30). Next step: begin F-1 (terms management UI).*
