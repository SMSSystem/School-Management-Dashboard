# Lesson Notes Feature — Buildout Spec

> **Status:** Planned — not yet implemented (spec written before code, per this repo's standing convention).
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
