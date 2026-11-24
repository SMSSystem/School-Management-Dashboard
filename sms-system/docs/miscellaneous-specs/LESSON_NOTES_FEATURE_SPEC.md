# Lesson Notes Feature — Buildout Spec

> **Update 2026-10-09:** the 500 KB file limit below no longer applies to teachers and institution admins: a file over 500 KB (up to 5 MB) is kept in the Realtime Database and the note's `attachment/data` holds its `blobKey` instead of `dataUrl`. See `LARGE_ATTACHMENTS_RTDB_SPEC.md`. Other roles and the rest of this spec are unchanged.

> **Status:** Implemented on branch `lesson-notes-feat`, **rules not yet deployed or emulator-tested** — see §10 for amendments that supersede parts of §3 and §5 below.
> **Feature:** Lets admin-related and teacher-related roles attach supplementary material — one document/image file plus a list of external resource links (YouTube, articles, etc.) — to a named lesson, optionally scoped to a class and/or a subject. Read access extends to students/parents of the linked class.
> **Route:** New, single role-aware page — no existing route today (see §7 and the note on `/dashboard/list/lessons` in §2).
> **Primary roles:** `institution_admin`, `super_admin`, `senior_teacher`, `regular_teacher` (authoring); `student`, `parent` (read-only, class-scoped).
> **Explicitly out of scope:** date/time fields entirely, multiple files per note, Firebase Storage, compression, spreadsheet/text/legacy-Office file types, redesigning the existing (non-functional) `/dashboard/list/lessons` page, and the separate future **Lesson Plan** feature (teacher-authored lesson plans — related but intentionally decoupled; not addressed by this spec at all).

---

## 1. Overview

This feature gives a teacher or admin a way to say "here's supplementary material for a lesson" — a name, optionally a class and/or subject it applies to, one uploaded file (PDF/Word/PowerPoint/image), and a list of external links. Students and parents of the linked class can see it; there is no submission, grading, or scheduling workflow of any kind — that distinguishes this cleanly from Assignments (`ASSIGNMENTS_FEATURE_SPEC.md`), which this feature otherwise borrows heavily from architecturally.

Scope was deliberately cut hard during brainstorming, against a same-day production deadline. Everything cut is listed explicitly in §8, not just silently dropped.

---

## 2. Background / Investigation Findings

- **`/dashboard/list/lessons` is not a real feature.** `LessonForm.tsx`'s `onSubmit` does only `console.log(data); onClose?.()` — it has never written to Firestore. The nav item is live and visible to admin/teacher roles today (`Menu.tsx:198-208`), so anyone who clicks "Add lesson" hits a form that silently does nothing. **This spec does not build on top of that page** — Lesson Notes is a new collection and a new page. What (if anything) eventually happens to the real, still-unimplemented "Lessons" concept (schedule-of-record, distinct from this feature) is a separate decision, out of scope here.
- **`firestore.rules` already has real, deployed rules for a `lessons` collection** (`firestore.rules:535-544` flat, plus a nested cutover-ready copy at `:1069-1080`) shaped identically to Exams — `isTeacherOrAbove()` create, admin/own-teacher/department-senior_teacher update, admin delete — even though the UI behind it was never finished. Confirms the backend convention this spec's own rules (§5) follow is already an established, low-risk pattern in this codebase.
- **Firebase Cloud Storage requires the Blaze (billing-linked) plan as of February 3, 2026** — it's no longer available on Spark at all, even within a nominal free allowance. This project is confirmed 100%-Spark (`firebase.json` has only a `firestore` key; no `storage.rules`; no Cloud Functions). Per your explicit choice, this spec does not introduce a Blaze dependency — it continues the base64-in-Firestore pattern the Assignments/photo-upload features already use.
- **The Firestore 1 MiB per-document hard limit rules out multiple files per note** under the base64-in-Firestore approach — the existing `documentUpload.ts` pipeline caps a single file at ~500 KB raw specifically to stay under that limit after base64's ~4/3 inflation. Two files at that same cap would already exceed it. This is a hard constraint, not a preference — it's why this spec allows exactly one file per lesson note.
- **`documentUpload.ts` already validates the exact file types this feature needs, unmodified**: PDF, DOCX, PPTX, JPEG, PNG, WEBP — magic-byte-sniffed, never trusting declared MIME/extension alone (`sniffDocumentType()`, `documentUpload.ts:61-73`). Zero new validation logic is needed for §1's file-type scope. (Spreadsheet/text support was investigated and explicitly deferred — see §8 — partly because `.xlsx` shares DOCX/PPTX's ZIP magic-byte ambiguity and `.txt`/`.csv` have no signature to sniff at all.)
- **Compressing already-compressed formats doesn't work.** Confirmed via web search: gzip/deflate on top of DOCX/PPTX/XLSX/PDF (all already internally DEFLATE-compressed) saves roughly 1% at best, sometimes nothing. This is why §8 defers compression entirely rather than budgeting time for it.
- **The exact "class-scoped, not student-scoped" read-visibility problem this feature has was already solved for Assignments**, and the solution is directly reusable:
  - **Student clause**: `myRole() == 'student' && resource.data.classId == me().classId` — `me()` is an existing helper that resolves the requesting user's own Firestore doc via `get()` (used identically in `firestore.rules:1117` for assignments).
  - **Parent clause**: a lesson note has no `studentId` field to build the usual deterministic `student_parents/{parentId}_{studentId}` `exists()` check from (that pattern needs a specific student, not a class). Assignments hit this exact same shape and resolved it via a broad `isParent()` read grant, narrowed by the query/UI layer to the parent's own linked children's classIds — not by the rule itself (`firestore.rules:1119-1128`, and the identical precedent already established for `generalAttendance`/`subjectAttendance`). This spec reuses that resolution verbatim.
- **`isValidAttachmentDataUrl()` is a general-purpose `firestore.rules` helper**, not assignment-specific by name — directly reusable for this feature's own attachment field without writing a new validation function.
- **`AssignmentForm.tsx`'s self-attribution invariant** (a teacher can never create a document attributed to someone else — `AssignmentForm.tsx:89-96`) is reused here: `teacherId` is always `request.auth.uid` at creation, enforced in rules, not just the UI.

---

## 3. Resolved Design Decisions

| #   | Decision                        | Choice                                                                                                                                                                                                                     | Rationale                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | File storage                    | Base64-in-Firestore, one file per note, lazy-loaded from a sub-document                                                                                                                                                    | No Blaze/Storage dependency (§2); the sub-document split keeps the list query from pulling every note's file payload just to render a table row.                                                                                                                                                                              |
| 2   | Read audience                   | Admin/teacher roles (full CRUD) **plus** students/parents of the linked class (read-only)                                                                                                                                  | Explicit choice — the more natural reading of "supplement a lesson," not an internal-only authoring tool.                                                                                                                                                                                                                     |
| 3   | Date/time fields                | Dropped entirely — no date, no time, no range                                                                                                                                                                              | Explicit choice, made after initially considering a single date; a lesson note in v1 has no temporal anchor at all.                                                                                                                                                                                                           |
| 4   | Class/subject linkage           | Both optional and independent — 0, 1, or 2 may be set                                                                                                                                                                      | Matches the three real-world scenarios you named (class-specific, subject-specific, both) without forcing either.                                                                                                                                                                                                             |
| 5   | Student/parent visibility scope | **Only applies when `classId` is set.** A subject-only note (no class) is admin/teacher-only in v1                                                                                                                         | Explicit choice, made after flagging that "which students take this subject" needs subject-enrollment-aware rules (`subjectEnrollments`) not worth building tonight.                                                                                                                                                          |
| 6   | File types                      | PDF, Word (`.docx`), PowerPoint (`.pptx`), images (JPEG/PNG/WEBP)                                                                                                                                                          | Exactly what `documentUpload.ts` already validates, unmodified (§2) — genuinely free to include, not extra scope.                                                                                                                                                                                                             |
| 7   | Multiple files per note         | No — exactly one, matching Assignments' own precedent                                                                                                                                                                      | Firestore's 1 MiB document limit makes more than one mathematically infeasible under this storage approach (§2).                                                                                                                                                                                                              |
| 8   | Compression                     | Not built                                                                                                                                                                                                                  | Confirmed near-zero benefit on already-compressed formats (§2) — not worth the added dependency/complexity for the expected gain.                                                                                                                                                                                             |
| 9   | Lazy-loading                    | Yes — attachment payload lives in a separate sub-document, fetched only on open/download                                                                                                                                   | The one optimization from the brainstorm that's actually valuable: keeps the list page fast regardless of how many notes exist.                                                                                                                                                                                               |
| 10  | Firebase Storage                | Not adopted                                                                                                                                                                                                                | Requires enabling Blaze billing (§2) — a deliberate business decision, not something to fold into tonight's deadline.                                                                                                                                                                                                         |
| 11  | Route structure                 | One role-aware route — admin/teacher see full CRUD, student/parent see a read-only filtered view                                                                                                                           | Matches the existing General/Subject Attendance pattern of branching by role within one component; least new surface area to build.                                                                                                                                                                                           |
| 12  | Authoring UI shape              | A single list page + create/edit modal (matching Rubrics/Houses), no dedicated detail page                                                                                                                                 | v1's field count is small enough that a modal isn't cramped; no submission/grading workflow exists here to justify Assignments' dedicated detail-page shape.                                                                                                                                                                  |
| 13  | Senior_teacher visibility       | **Narrow, role-filtered — matches Assignments exactly, for both read and update.** A senior_teacher sees/edits their own notes plus same-department `regular_teacher`-authored notes, but **not** another senior_teacher's | Explicit choice — deliberately deviates from this codebase's majority convention (Lessons/Exams/Results/Feedback all use the broader department-scoped `isSeniorTeacherFor()` unmodified) in favor of matching Assignments' `seniorTeacherMayActOnAssignment()` precedent, applied symmetrically to both viewing and editing. |
| 14  | Self-attribution                | `teacherId` always `request.auth.uid` at creation, enforced in rules                                                                                                                                                       | Reuses `AssignmentForm.tsx`'s existing invariant (§2) rather than inventing a new one.                                                                                                                                                                                                                                        |
| 15  | Relationship to Lesson Plan     | None — fully separate feature, not addressed here                                                                                                                                                                          | Per your original framing: "completely separate, yet will-be-connected... in the future." No connective tissue is speculatively built now.                                                                                                                                                                                    |
| 16  | Supported-format UI messaging   | The file-upload control must always visibly display accepted formats **and** the ~500KB size cap, not just surface them as a rejection error after the fact                                                                | Explicit instruction — a user shouldn't discover either constraint only by hitting it.                                                                                                                                                                                                                                        |

---

## 4. Data Model

### 4.1 `LessonNoteDocument` — new collection

`institutions/{institutionId}/lessonNotes/{lessonNoteId}` — born nested, matching the Assignments/Rubrics precedent (not the older flat-then-migrated pattern several other collections in this app are still mid-cutover on).

```ts
export type LessonNoteDocument = {
  institutionId: string;
  name: string; // required — the only identifying field, now that date/time are dropped (§3 decision 3)

  classId?: string;
  className?: string; // denormalized, matches every other *Name-alongside-*Id field in this app
  subjectId?: string;
  subjectName?: string;

  teacherId: string; // always request.auth.uid at creation (§3 decision 14)
  teacherName: string;
  teacherRole: string; // 'regular_teacher' | 'senior_teacher' | ... — denormalized at write time, mirrors AssignmentDocument's identical field; required by the narrow senior_teacher visibility check (§3 decision 13, §5)
  departmentId?: string; // denormalized at write time, mirrors AssignmentDocument's identical field — read by the same narrow visibility check

  hasAttachment: boolean; // cheap list-view flag; the actual payload lives in §4.2, not here
  attachmentFileName?: string;
  attachmentMimeType?: string; // 'application/pdf' | docx MIME | pptx MIME | 'image/jpeg' | 'image/png' | 'image/webp'
  attachmentSize?: number; // bytes, pre-base64 — same cap-check convention as AssignmentDocument.attachmentSize

  resourceLinks: { url: string; label?: string }[]; // empty array, not undefined, when none are added

  createdBy: string;
  createdByRole: string;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
};
```

### 4.2 `LessonNoteAttachmentDocument` — lazy-loaded sub-document

`institutions/{institutionId}/lessonNotes/{lessonNoteId}/attachment/data` — a single, fixed-ID document. Never included in the list-page query; fetched via one `getDoc()` only when a user opens/downloads that specific note's file (§3 decision 9).

```ts
export type LessonNoteAttachmentDocument = {
  dataUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
};
```

Splitting this out is the one meaningful optimization from the brainstorm's "compress/dynamically-load/preload" list that's actually worth building (§3 decision 9) — everything else in that list was rejected as low-value (compression) or out of scope (preloading wasn't pursued further once lazy-loading covered the real problem: keeping the list view fast).

---

## 5. Firestore Rules

Mirrors the Assignments `assignments` block's shape closely (`firestore.rules:1103-1128`), reusing the exact `me().classId` / broad-`isParent()` resolution already established there (§2), **and** its `seniorTeacherMayActOnAssignment()` narrow-visibility pattern (`firestore.rules:171-176`), per §3 decision 13. Pseudocode, not final syntax — written here to the same level of detail `ASSIGNMENTS_FEATURE_SPEC.md` uses for its own rules section.

```
// Mirrors assignmentData()/seniorTeacherMayActOnAssignment() (firestore.rules:
// 166-176) exactly, for the identical reason: the attachment sub-document
// match block below has no direct access to the parent lessonNote's fields,
// so it needs a get()-backed helper. The top-level lessonNotes match block
// itself does NOT need this helper — resource.data is already in scope
// there, same as assignments' own block.
function lessonNoteData(institutionId, lessonNoteId) {
  return get(/databases/$(database)/documents/
    institutions/$(institutionId)/lessonNotes/$(lessonNoteId)).data;
}

function seniorTeacherMayActOnLessonNote(institutionId, lessonNoteId) {
  let n = lessonNoteData(institutionId, lessonNoteId);
  return myRole() == 'senior_teacher'
    && me().departmentId == n.departmentId
    && n.teacherRole == 'regular_teacher';
}

match /institutions/{institutionId}/lessonNotes/{lessonNoteId} {
  allow read: if isSignedIn() && inMyInstitution(institutionId)
    && (
      isAdminOrAbove()
      || resource.data.teacherId == request.auth.uid
      // §3 decision 13 — narrow, NOT isSeniorTeacherFor(): own department AND
      // authored by a regular_teacher specifically, matching assignments'
      // identical resource.data-direct form (firestore.rules:1114-1116) —
      // a senior_teacher does NOT see another senior_teacher's notes.
      || (myRole() == 'senior_teacher'
          && me().departmentId == resource.data.departmentId
          && resource.data.teacherRole == 'regular_teacher')
      || (myRole() == 'student' && resource.data.classId != null && resource.data.classId == me().classId) // §3 decision 5 — only reachable when classId is set
      || isParent() // broad; narrowed by the query/UI to the linked child's own classId — same resolution as assignments' identical classId-not-studentId shape (§2)
    );

  allow create: if isTeacherOrAbove() && inMyInstitution(institutionId)
    && institutionFieldMatchesPath(institutionId)
    && request.resource.data.teacherId == request.auth.uid; // §3 decision 14

  allow update: if inMyInstitution(institutionId) && institutionFieldMatchesPath(institutionId)
    && (isAdminOrAbove()
        || resource.data.teacherId == request.auth.uid
        // §3 decision 13 — same narrow check as the read clause above,
        // applied symmetrically to editing, matching how
        // seniorTeacherMayActOnAssignment() gates both assignment-submission
        // reads AND grading (firestore.rules:1169-1171, 1203-1206).
        || (myRole() == 'senior_teacher'
            && me().departmentId == resource.data.departmentId
            && resource.data.teacherRole == 'regular_teacher'));

  allow delete: if isAdminOrAbove() && inMyInstitution(institutionId);
}

match /institutions/{institutionId}/lessonNotes/{lessonNoteId}/attachment/{docId} {
  allow read: if isSignedIn() && inMyInstitution(institutionId)
    && (isAdminOrAbove()
        || lessonNoteData(institutionId, lessonNoteId).teacherId == request.auth.uid
        || seniorTeacherMayActOnLessonNote(institutionId, lessonNoteId)
        || (myRole() == 'student' && lessonNoteData(institutionId, lessonNoteId).classId == me().classId)
        || isParent());
  allow create: if isTeacherOrAbove() && inMyInstitution(institutionId)
    && lessonNoteData(institutionId, lessonNoteId).teacherId == request.auth.uid
    && isValidAttachmentDataUrl(request.resource.data.dataUrl); // reuses the existing general-purpose helper (§2), no new validation function needed
  allow update, delete: if isAdminOrAbove()
    || lessonNoteData(institutionId, lessonNoteId).teacherId == request.auth.uid; // replacing the file (e.g. fixing a wrong upload) is a delete-then-recreate at the app layer, not a partial field update
}
```

---

## 6. File Upload & Attachment Handling

No new validation code — `processDocumentUpload()` / `sniffDocumentType()` in `documentUpload.ts` already cover exactly this feature's file-type scope (§2, §3 decision 6). The only new client-side work is:

1. On create/edit: call the existing `processDocumentUpload(file)`, then write the resulting `{dataUrl, fileName, mimeType, size}` to the **sub-document** (§4.2), not the main `LessonNoteDocument` — and set `hasAttachment: true` plus the three metadata-only fields on the main doc in the same logical operation (two writes: one to the parent doc's metadata fields, one to the sub-document — not a single write, since they're different documents).
2. On the list/table view: render `hasAttachment` as a simple icon/badge — no fetch of the sub-document at all.
3. On open/download: one `getDoc()` against the sub-document, on demand, the first time a user actually interacts with that note's file.
4. **On the file input itself (§3 decision 16):** always-visible helper text stating the accepted formats and the size cap — e.g. reusing `documentUpload.ts`'s own existing rejection-message copy ("PDF, Word (.docx), PowerPoint (.pptx), JPEG, PNG, or WEBP") plus "500KB max," shown under the input by default, not only surfaced after a rejected upload. Pair with `accept="application/pdf,.docx,.pptx,.jpg,.jpeg,.png,.webp"` on the native `<input type="file">` so the OS file picker itself is also pre-filtered — a cheap, standard complement to the visible text, not a substitute for it (the `accept` attribute is only a UI hint; `sniffDocumentType()` remains the real enforcement, same as today).

---

## 7. UI / Pages

**One role-aware route** (§3 decision 11) — exact path not yet named, a natural candidate is `/dashboard/lesson-notes` (new top-level nav item, matching how Rubrics/Houses/Assignments each get their own).

- **institution_admin / super_admin / senior_teacher / regular_teacher**: full table (matching Rubrics/Houses' existing list-page shape) — name, class, subject, teacher, attachment indicator, link count, actions (edit/delete via `FormModal`, same as every other simple entity in this app). "Add" button opens a create modal (§3 decision 12) — no dedicated detail page.
- **student / parent**: the same route renders a read-only, filtered view — only notes where `classId` matches the student's own class (or, for a parent, any linked child's class — resolved client-side the same way Assignments' parent fan-out already does: resolve each linked child's `classId` via a `getDoc` on that child's own user doc, then query notes per resolved `classId`). No edit/delete affordances render for these roles at all — enforced by both the UI (no buttons) and the rules (§5, no write grant).

**Form fields (create/edit modal):** `name` (required), class picker (optional, via the existing `useInstitutionClasses()` hook), subject picker (optional, via `useInstitutionSubjects()`), one file input (reusing `documentUpload.ts`), a repeatable URL+label list (add/remove rows, each validated per §9 of this spec's sibling concern — see note below).

**URL validation (client-side, at minimum):** `new URL(input)` (rejects malformed strings), restrict to `http:`/`https:` protocols only (blocks `javascript:`/`data:`/`vbscript:`), render every link as `<a href={url} target="_blank" rel="noopener noreferrer">` — never `iframe`-embedded, never fetched/previewed server-side (no Cloud Functions exist in this project to do that with anyway).

---

## 8. Explicitly Deferred

Everything below was considered during brainstorming and intentionally cut, not overlooked:

- **Date and time fields** — entirely, not just ranges (§3 decision 3). A future pass could add a single optional date if "which lesson, when" becomes a real problem in practice.
- **Multiple files per lesson note** — blocked by Firestore's 1 MiB document limit under the current storage approach (§2); only resolvable by adopting Firebase Storage, which itself requires a deliberate Blaze-billing decision (§3 decision 10).
- **Firebase Storage** — not adopted; stays a live, separate future decision, not something this spec's v1 depends on.
- **Lossless compression of uploaded files** — confirmed near-zero benefit on the file types this feature supports (§2); not worth the added dependency.
- **Spreadsheet files (`.xlsx`/`.csv`)** — `.xlsx` shares DOCX/PPTX's ZIP-signature ambiguity (solvable, just not built yet); `.csv` has no magic-byte signature at all, a weaker validation guarantee than every other supported type.
- **Plain-text files (`.txt`)** — same no-signature problem as `.csv`.
- **Legacy pre-2007 Office formats** (`.doc`/`.ppt`/`.xls`) — different magic-byte signature (OLE Compound File) than modern OOXML; not sniffed by the existing pipeline.
- **Redesigning or finishing the existing `/dashboard/list/lessons` page** — that page's fate (finish it for real, retire it, or something else) is a separate decision from this feature (§2).
- **The Lesson Plan feature** — stated by you as related-but-separate and future; this spec does not model any connection to it, speculative or otherwise (§3 decision 15).
- **Subject-enrollment-aware read rules** for subject-only (no class) notes — would need to mirror `subjectAttendance`'s `subjectEnrollments` lookup; deferred, subject-only notes stay admin/teacher-only in v1 (§3 decision 5).

---

## 9. Implementation Order

A reasonable build sequence, not a rigid requirement:

1. `LessonNoteDocument` / `LessonNoteAttachmentDocument` types (`firebase.ts`).
2. `firestore.rules` — the `lessonNotes` + `lessonNotes/{id}/attachment` blocks (§5), plus the `lessonNoteData()` helper.
3. `firestore.indexes.json` — a composite index is likely needed for the student/parent filtered query (`classId` + whatever ordering the list view uses); confirm via a `--dry-run` deploy against the real query shape once built, matching this repo's established verification habit.
4. The list page + create/edit modal (§7) for admin/teacher roles — build and manually verify this half first, since it's the larger surface.
5. The student/parent read-only branch of the same route (§7) — smaller diff once step 4 exists, since it reuses the same data-fetching shape with a narrower query.
6. File upload wiring (§6) — the validation logic itself needs no changes; only the two-write (metadata + sub-document) pattern is new.
7. URL list UI + validation (§7).

---

## 10. Implementation Amendments (supersede §3, §5, §7 where they differ)

Review before building found defects in the §5 pseudocode and left several product questions open. Resolved as follows; the shipped code follows this section.

### 10.1 Rule corrections (`firestore.rules`, `lessonNotes` blocks)

1. **Attachment create/update uses `getAfter()`** on the parent note. `get()` sees pre-write state, so creating a note and its file in one batch would have been denied.
2. **Parent read requires a class** (`'classId' in n && n.classId != null`), on both the note and the file. The §5 draft's bare `isParent()` exposed subject-only notes (contradicting decision 5).
3. **Ownership fields are frozen on update:** `teacherId`, `teacherRole`, `departmentId`, `institutionId`, `createdBy`, `createdByRole`, `createdAt`. Creators can't claim another role in `teacherRole` or a department that isn't theirs.
4. **Shape validation on create/update:** `hasOnly` key list, non-empty `name` (≤150), `resourceLinks` is a list of ≤10, `createdAt`/`updatedAt` equal `request.time`, and **a note must have a file or at least one link**. Per-link http/https validation stays client-side (rules cannot loop), re-checked at render.
5. **Senior teachers** (narrow rule) may also replace the file, matching their edit right.
6. **Delete:** the author, an admin, or a senior teacher on a same-department regular teacher's note (was admin-only). Delete is one batch removing the note and its `attachment/data` document — Firestore does not cascade. Admins can also delete an orphaned file document.

### 10.2 Product decisions

- Teachers choose only classes/subjects they teach — **UI-only**, derived from `subjects.teacherIds/classIds/classScope` (`src/lib/teacherScope.ts`); same exposure as Gradebook, not enforced by rules.
- `super_admin` is hidden from the nav and route in v1; an institution picker is deferred. Rules already allow super_admin.
- Route: `/dashboard/list/lesson-notes`. Sidebar label **"Lessons"** for institution_admin, senior_teacher, regular_teacher, student, parent (the old non-functional Lessons nav item was replaced; its route, `LessonForm` and `lessons` rules are untouched for a future real Lessons feature).
- Page heading: "Lesson Notes" (staff), "My Lessons" (student), "Lessons" (parent).
- Quick Actions panels (Lessons / Assignments / Results / Attendance) added to the student ("View My Lessons") and parent ("View Lessons") dashboards; the senior-teacher "View My Lessons" card now links here.
- The 500KB cap is unchanged; there is no hard per-institution quota.

### 10.3 Free-tier (Spark) budget

- Firestore storage is 1 GiB per project, **shared** with assignment attachments, submissions (multiple attempts each) and photos. At the 500KB cap that is roughly 1,400 files in total across all of them. Deleting a note (which removes its file) is the cleanup path.
- Opening a file costs one document read plus about 2-3 rule `get()` reads; a list load is one query. Far inside 50k reads/day.
- (Superseded: see §12.4 and §14.) Every query is equality filters plus `orderBy` and `limit(100)`, so each needs a composite index in `firestore.indexes.json`. Teachers run two merged queries (own, plus same-department regular-teacher notes for senior teachers).
- File payloads are fetched with a bare `getDoc()` (`src/lib/lessonNoteAttachment.ts`), never through React Query, because `queryClient.ts` persists to `sessionStorage` (~5MB).

### 10.4 Known limits

- `users/{uid}` self-update permits a student to change their own `classId`, which weakens class scoping here and in Assignments. Tracked separately.
- Parents can read other classes' notes by calling the API directly (UI narrows to linked children's classes) — the same trade-off as Assignments.
- Not yet verified against the emulator or deployed: run the manual QA matrix before `firebase deploy --only firestore:rules`.

### 10.5 Department dependency (added after QA)

The narrow senior_teacher rule needs `departmentId` on the note, stamped at creation from the author's own `users/{uid}.departmentId`, and the field is **frozen** afterward — a note written by a department-less teacher can never be matched by a senior and cannot be repaired from the UI (only the Admin SDK can stamp it).

- Teacher accounts now require a department wherever the institution has departments (`ISSUES_AND_GAPS.md` #38), and `LessonNoteForm` shows a warn-only notice to a teacher who has none. Saving is not blocked.
- `firestore.rules`: a user can no longer edit their own `users.departmentId` (admin-only), so the stamped value can't be self-assigned. This also tightens the create check above ("can't claim a department that isn't theirs"), which compares against `me().departmentId`.
- Nothing requires `departmentId` on a note in the rules (it remains optional in `isValidLessonNote`); the guarantee is the form-level requirement plus admins assigning departments by hand.

## 11. Amendment: several files per note, optional links, three-line view header

> **Update 2026-11-03:** a note can now hold up to 12 files, with the 15 MB total unchanged, and a viewer can download them all at once. See `LESSON_NOTE_12_FILES_SPEC.md`. The figures of 5 files below are from when this section was written.

Branch `lesson-notes-refactor`. Supersedes §3, §4.1, §4.2, §5 and §10.1 point 4 where they differ.

### 11.1 Decisions

| Topic | Decision |
| --- | --- |
| Files per note | Up to **5**, each up to the role's limit (5 MB for teachers and admins, 500 KB for any other role), and up to **15 MB in total** per note (checked in the client only: rules cannot sum a list). Files over 500 KB are kept in the Realtime Database as before (`LARGE_ATTACHMENTS_RTDB_SPEC.md`). |
| File or link | **Neither is required.** A note can be just a name (and class and subject). The rule "a note must have a file or at least one link" is removed from the form and from `isValidLessonNote`. Link URLs are still checked http/https. |
| View header | The line under the title is three lines, each shown only when the note has that value: `· Class: [class]`, `· Subject/Course: [subject]`, `· Overseen by: [teacher]`. |
| Old notes | An owner-run script (`scripts/migrate-lesson-note-files.mjs`) adds the new fields to existing notes. Until it has run, the app still reads a note's single file from the old fields (`noteFiles()` in `src/lib/lessonNoteFiles.ts`). |

### 11.2 Data model

- **Note** (`LessonNoteDocument`): `attachments: [{ id, fileName, mimeType, size }]` (for lists and the view modal, so no file is read to show names) and `attachmentIds: [id]` (the ids of the file documents; rules can't search a list of maps). Both present or both absent, at most 5, equal length. `hasAttachment` stays (`attachments` non-empty).
- **File documents:** `lessonNotes/{id}/attachment/{fileId}`, one per file, fields unchanged (`dataUrl` XOR `blobKey`, `fileName`, `mimeType`, `size`). New files get a random id; a migrated note's file keeps the id `data` (so nothing is copied).
- **Legacy fields** `attachmentFileName`, `attachmentMimeType`, `attachmentSize` are no longer written; the form deletes them as an older note is saved; `--drop-legacy` removes them from the rest.

### 11.3 Rules

- `isValidLessonNote`: the two new keys are allowed; `('attachments' in d) == ('attachmentIds' in d)`; at most 5; equal lengths; the file-or-link condition is gone.
- Attachment sub-document create/update: `docId` must match `^[A-Za-z0-9-]{1,40}$` and be in the note's `attachmentIds` **after the write** (`getAfter()`); a note without the list allows only `data`. Everything else (`hasAttachment == true`, key set, size bound, `dataUrl` XOR `blobKey`, the delete rule) is unchanged.
- The rules accept both the old and the new shape, so they are deployed **first**.

### 11.4 Behaviour and gotchas

- **Save** writes the note, the new file documents and the deletions of removed ones, and the audit entry in **one batch**. Large new files are uploaded first (`commitWithBlobs`); if the save fails every upload is removed again. Removed files' Realtime Database keys are read before the batch and those files deleted only after it succeeds.
- **Delete** lists the note's file documents (at most 5 reads), deletes them and the note in one batch, then deletes their Realtime Database files.
- **The orphan sweep** now counts every `attachment/{fileId}` document as a reference (`noteFileInstitution()`); matching only `data` would have deleted new files' blobs after the 7-day grace.
- Download is one `getDoc()` per file, on click only; lists read no file.

### 11.5 Free tier

No new indexes, no Cloud Functions, no Blaze feature. List loads are unchanged (the file metadata is on the note). Delete adds at most 5 reads. Replace or remove reads only the removed files. A note can now hold up to 25 MB of Realtime Database data (5 files x 5 MB per file, the 15 MB total is the UI cap), against the 200 MB per-institution budget.

### 11.6 Deploy order

1. `firebase deploy --only firestore:rules` (additive: both shapes valid).
2. `node scripts/migrate-lesson-note-files.mjs --key=<path>` (dry run), then `--live`. Idempotent.
3. Merge and deploy the app (reads the new shape; includes the sweep change).
4. Run the migration `--live` again (catches notes edited by the old app in between).
5. Later: `--drop-legacy` and, if wanted, tighten the rules. Rollback: revert the app; the rules stay; old notes keep their legacy fields until step 5.

---

## 12. Amendment: a note for several classes (2026-10-20)

Supersedes §3 decision 5 (one optional class), §4.1 (`classId` / `className`) and the student clause of §5 where they differ.

### 12.1 Decisions

| Topic | Decision |
| --- | --- |
| Classes per note | 0 to **20**. The form shows a checkbox list instead of a select. Teachers choose among the classes they teach (UI only, as before); an administrator chooses any class. No "all classes" option: a note with no class is still seen by staff only. |
| Subject | One subject per note, applied to every chosen class: a student sees the note if they are in a chosen class and take the subject there (`takesSubject`, per class). |
| Parents | Unchanged: the broad read of #66, narrowed by the page to the children's classes. |
| Students | **Broad read** like parents (see 12.3); the page narrows to their classes. |

### 12.2 Data model

`classIds: string[]` and `classNames: string[]` (same length, 1 to 20) on the note, with `classId` / `className` holding the **first** class, so older readers, the parent query and the audit target still work. A note for no class has none of the four fields. Notes from before have `classId` only and are read as one class (`noteClassIds()` in `src/lib/lessonNoteClasses.ts`). No migration is needed to deploy.

### 12.3 Rules

- `isValidLessonNote`: `classIds` and `classNames` allowed; when `classIds` is present it is a list of 1 to 20, `classNames` has the same size and `classId == classIds[0]`.
- `lessonNoteHasClass(n)` also accepts a note that has `classIds`.
- `lessonNoteReadableBy`: `(myRole() == 'student' && lessonNoteHasClass(n))` replaces the `inMyClasses(n.classId)` clause. A tighter rule cannot be proven for a query on `classIds`: the emulator denied every form tried (`hasAny` both ways, with and without the `classId` fallback, `array-contains-any`). Recorded in `ISSUES_AND_GAPS.md` #66.

### 12.4 Queries and index

Students and parents run `classId in <ids>` (notes from before, and every note's first class) and `classIds array-contains-any <ids>` (notes for several classes), ids in groups of 10. New composite index: `lessonNotes` `classIds` (array-contains) + `updatedAt` descending. Admin and teacher queries are unchanged. (Since v2.53.0 every query orders by `createdAt`, so the index is `classIds` + `createdAt` descending; see §14.)

### 12.5 Free tier

A note whose first class is one of the student's classes is returned by both queries and read twice until old notes get a `classIds` list (an optional later script). Listeners per student: two per group of 10 classes. Writes: none extra.

### 12.6 Deploy order

1. `npm run firebase:deploy:rules` and `npm run firebase:deploy:indexes`; wait until the new index is READY. Safe first: no client writes `classIds` yet.
2. Merge and deploy the app.

---

## 13. Amendment: a note for several subjects (2026-10-20)

Supersedes the single `subjectId` / `subjectName` of §4.1 and the single-subject visibility check of section 12.1.

### 13.1 Decisions

| Topic | Decision |
| --- | --- |
| Subjects per note | 0 to **5**, a checkbox list in the form. Teachers choose among the subjects they teach; an administrator any subject. |
| Who sees a note | A student (or a parent's child) who is in one of the note's classes **and takes at least one of its subjects there** (`takesSubject`: the home class gives every subject, an additional class only the subjects chosen for it). Classes and subjects are two independent lists; there is no per-subject class pairing. A note with no subject is seen by everyone in its classes. |
| Class list for a teacher | The classes where they teach **any** ticked subject (`classOptionsForSubjects`); every class they teach when no subject is ticked. Ticking or unticking a subject drops the ticked classes that are no longer offered. |
| Page | Every subject is shown (Subject column, one chip each on a phone card, "Subjects/Courses" in the details dialog). The Subject dropdown and chips list each subject once and a note appears under each of its subjects; search matches any. |

### 13.2 Data model

`subjectIds: string[]` and `subjectNames: string[]` (same length, 1 to 5) on the note, with `subjectId` / `subjectName` holding the **first**, exactly as `classId` does for the classes. A note for no subject has none of the four fields. Notes from before have `subjectId` only and are read as one subject (`noteSubjectIds()` in `src/lib/lessonNoteSubjects.ts`). No migration, no new index (subjects are never queried), and the read rule is unchanged (rules do not look at subjects).

### 13.3 Rules

`isValidLessonNote`: `subjectIds` and `subjectNames` allowed; when `subjectIds` is present it is a list of 1 to 5, `subjectNames` has the same size and `subjectId == subjectIds[0]`. Checked on the Firestore emulator (nine subject cases) and by `lessonNoteClassesRules.test.ts`.

### 13.4 Audit

`lesson_note_edit` names the first three classes and the first three subjects and counts the rest, inside the 300-character limit.

### 13.5 Free tier and deploy order

No new reads, writes or indexes. Deploy the rules first (`npm run firebase:deploy:rules`; additive), then the app. No data script.

## 14. Amendment: newest by creation, and a sort (v2.53.0, 2026-11-18)

### 14.1 Order

Every role's query now orders by `createdAt` descending instead of `updatedAt` (`src/hooks/useLessonNotes.ts`), and the merged lists are re-sorted by `createdAt`. Editing a note no longer moves it to the top. `createdAt` is set once on create (`createdAt == request.time` in the rules) and the update rule rejects any change to it, so every note has one and none drops out of an `orderBy('createdAt')` query.

### 14.2 Indexes and deploy order

Four composite indexes: `teacherId`, `departmentId` + `teacherRole`, `classId`, and `classIds` (array-contains), each + `createdAt` descending. The admin query (no filter) uses the automatic single-field index. Deploy the indexes first (`npm run firebase:deploy:indexes`) and wait until all four are READY before the app goes live: until then every teacher, student and parent query fails and the page shows "Could not load lesson notes". The four older `updatedAt` versions were removed in v2.57.2; the `createdAt` ones are now the only lesson-note composite indexes, and `lessonNoteClassesRules.test.ts` fails if an `updatedAt` one comes back.

### 14.3 Sort and filters

A **Sort** menu (Newest first, A–Z) on the list page sorts the loaded notes with `sortByNameNatural` before paging; the choice is remembered for the session. The subject chips are hidden below the md width, where the Subject menu does the same job. Both work over the notes already loaded (at most 100 per listener), not the whole collection.

### 14.4 Free tier

Same reads as before: the same listeners, the same limits, one shared snapshot per query. An edit outside the newest 100 no longer pulls the note into the window, so it reads nothing.
