# Large Attachments (5 MiB) via Realtime Database — Spec

> **Status:** design only, nothing implemented. Written 2026-10-09 from a brainstorm with the owner; open questions answered the same day (§13).
> **Scope:** Lesson Notes file and Assignment **teacher** attachment, uploaded by teacher and institution-admin roles. **Student submissions are out of scope and stay at 500 KiB inline in Firestore.**
> **Hard constraint:** Firebase Spark only (no Blaze, no Cloud Functions, no Cloud Storage).

---

## 1. Goal

Raise the per-file limit from **500 KiB to 5 MiB** for files that teachers and institution admins attach to Lesson Notes and Assignments, storing the larger files in the **Realtime Database (RTDB)** instead of inside Firestore documents.

Owner motivations (confirmed): separate free storage quota, one large string value without chunking, and keeping file bodies out of the documents that lists and queries read.

---

## 2. Findings (how it works today)

| Area            | Today                                                                                                                             | Source                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Pipeline        | `processDocumentUpload()` sniffs magic bytes (PDF, ZIP→DOCX/PPTX, JPEG/PNG/WEBP), builds `data:<mime>;base64,…`                   | `src/lib/documentUpload.ts`                     |
| Cap             | `MAX_SOURCE_FILE_BYTES = 500 * 1024`, `MAX_OUTPUT_CHARS = 700_000`                                                                | same                                            |
| Rule cap        | `isValidAttachmentDataUrl()` ≤ 700,000 chars + MIME regex                                                                         | `firestore.rules` (~line 169)                   |
| Lesson notes    | each file in its own `lessonNotes/{id}/attachment/{fileId}` (up to 5 per note; see `LESSON_NOTES_FEATURE_SPEC.md` section 11) (`dataUrl, fileName, mimeType, size`), fetched only on download, never via React Query | `LessonNoteForm.tsx`, `lessonNoteAttachment.ts` |
| Assignment file | inline on the assignment doc (`attachmentDataUrl`, …) — read by every list query that returns assignments                         | `AssignmentForm.tsx`, rules ~1428               |
| Submissions     | `fileDataUrl` inline on `submissions/{studentId}` and on `attempts/{n}` — **unchanged by this spec**                              | `submissions.ts`, rules ~1467–1510              |
| RTDB today      | only `/sessions/{uid}` for the single-session lock; SDK imported lazily; needs `VITE_FIREBASE_DATABASE_URL`                       | `sessionLock.ts`, `database.rules.json`         |
| Cache           | React Query persists to `sessionStorage` (~5 MB) → file bodies must never go through it                                           | `queryClient.ts`                                |

Arithmetic: 5 MiB = 5,242,880 bytes → base64 = 6,990,508 chars (+ ≤ ~90-char `data:` prefix). That fits RTDB's 10 MB string limit and 16 MB SDK write limit, and cannot fit one Firestore document (1 MiB).

External limits (verify before relying; see §12): RTDB string 10 MB, SDK write 16 MB, key 768 bytes, depth 32, **Spark 100 simultaneous connections**, Spark 1 GB stored and 10 GB/month downloaded (third-party sources). Cloud Storage for Firebase requires Blaze.

---

## 3. Decisions

| #   | Decision                                                                                                                                                                                                                                | Reason                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | File bodies > 500 KiB go to **RTDB**; Firestore keeps only metadata + a blob key.                                                                                                                                                       | Owner choice.                                                                                                                                   |
| D2  | **Hybrid:** files ≤ 500 KiB stay inline in Firestore exactly as today.                                                                                                                                                                  | Old data, tests and rules keep working; nothing to migrate.                                                                                     |
| D3  | **Access model = unguessable key (capability).** `blobKey = crypto.randomUUID()` (never a push ID: push IDs are time-ordered and partly guessable). Whoever can read the Firestore doc can learn the key.                               | Owner choice. RTDB rules cannot read Firestore and there are no custom claims, so role / class / parent-link rules cannot be evaluated on RTDB. |
| D4  | **No parent `.read`** on `/files/**`: a file is readable only by exact path, never listed.                                                                                                                                              | Prevents enumeration; avoids accidental 7 MB × N downloads.                                                                                     |
| D5  | **Create-only.** A blob cannot be overwritten; replacing a file means a new key. Delete is allowed by key.                                                                                                                              | No silent tampering.                                                                                                                            |
| D6  | **Same limit for every type** (PDF, DOCX, PPTX, JPEG, PNG, WEBP): 5 MiB.                                                                                                                                                                | Owner choice.                                                                                                                                   |
| D7  | **Budgets:** 200 MB per institution (`/usage/institutions/{institutionId}/bytes`) **and** a global ceiling (`/usage/total/bytes`, ~900 MB, under the 1 GB Spark limit), both updated in the same multi-path write as the blob (§6.3).   | Owner choice. Honest limit: accounting, not authentication (§6.3).                                                                              |
| D8  | **Quota exhaustion risk is accepted** beyond the two budgets. Monitor; no per-user caps in v1.                                                                                                                                          | Owner choice.                                                                                                                                   |
| D9  | **Who may upload large files:** `senior_teacher`, `regular_teacher`, `institution_admin`. `super_admin` is not listed and is treated as excluded (assumption, §13). `student` stays at 500 KiB; `parent` and `spectator` are read-only. | Owner choice. **UI-enforced only:** RTDB rules cannot tell roles apart (§6.2), so this is a client check, not a security boundary.              |
| D10 | **Fail closed on upload:** the RTDB write is acknowledged **before** the Firestore write; if RTDB is unreachable the upload fails with a clear message. (The session lock fails open; this must not.)                                   | Never create a Firestore pointer to a missing file.                                                                                             |
| D11 | **`VITE_FIREBASE_DATABASE_URL` is required in every environment** (dev, e2e, production) so large files are never silently disabled. Without it a >500 KiB upload shows a clear configuration error; ≤ 500 KiB uploads are unaffected.  | Owner choice (large files must not be disabled). Dev/e2e must point at an RTDB instance (a dev/QA one is preferable to production).             |
| D12 | No role mirror in RTDB (rejected).                                                                                                                                                                                                      | Second source of truth, drift = security bug.                                                                                                   |
| D13 | **Orphan grace period = 7 days**, measured from a server-set `uploadedAt` stored on every blob (§6, §8).                                                                                                                                | Owner choice. See §8 for why a grace period exists.                                                                                             |

---

## 4. Data model

### 4.1 RTDB (new)

```
/files/{institutionId}/{blobKey} = {
  dataUrl: "data:<mime>;base64,…",   // ≤ 7,000,000 chars
  size: 123456,                      // raw bytes, ≤ 5,242,880
  mimeType: "application/pdf",
  uploadedAt: <server timestamp>,    // ServerValue.TIMESTAMP; used by the sweep (§8)
  uploadedBy: "<uid>"                // must equal auth.uid
}
/usage/institutions/{institutionId}/bytes = 12345678   // running total of raw bytes, ≤ 200 MB
/usage/total/bytes                        = 98765432   // all institutions, ≤ ~900 MB
```

The global counter lives under `usage/total`, a branch separate from `usage/institutions/$institutionId`, so the institution wildcard (and its 200 MB cap) can never apply to it.

### 4.2 Firestore changes (additive)

| Document                           | New optional field                                 | Rule                                 |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------ |
| `lessonNotes/{id}/attachment/{fileId}` | `blobKey` **instead of** `dataUrl`             | exactly one of `dataUrl` / `blobKey` |
| `assignments/{id}`                 | `attachmentBlobKey` instead of `attachmentDataUrl` | at most one                          |

Submissions and attempts are **not** changed.

Common new rule helper `isValidBlobKey(k)`: `k is string && k.matches('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')`. The lesson-note `size` and assignment `attachmentSize` get `is number && <= 5242880`.

`src/lib/firebase.ts` types gain the optional key fields; `LessonNoteAttachmentDocument.dataUrl` and `AssignmentDocument.attachmentDataUrl` stay optional.

---

## 5. Client design

1. **`documentUpload.ts`:** `processDocumentUpload()` takes the caller's cap. Teacher/admin callers (lesson note, assignment attachment) allow up to 5 MiB and return `{ kind: 'blob' | 'inline', … }` (inline when ≤ 500 KiB, current behaviour). The student submit path keeps the 500 KiB cap. Constants split: `MAX_INLINE_BYTES` (500 KiB), `MAX_BLOB_BYTES` (5 MiB). The "500KB max" strings in `LessonNoteForm` and `AssignmentForm` follow the active cap; the student submit UI text is unchanged.
2. **New `src/lib/blobStore.ts`** (lazy `import('firebase/database')`, like `sessionLock.ts`):
   - `putBlob(institutionId, processed)` → generates the key, does ONE multi-path `update()` writing `files/{inst}/{key}` (with `uploadedAt`, `uploadedBy`), `usage/institutions/{inst}/bytes` and `usage/total/bytes`; awaits the ack with a generous timeout (large payload, slow school network); returns the key.
   - `getBlobDataUrl(institutionId, key)` → exact-path `get()`; returns the data URL. Never a listener, never React Query.
   - `deleteBlob(institutionId, key, size)` → multi-path remove + both counter decrements, best-effort.
3. **Write order (D10):** `putBlob` → Firestore batch (metadata + key) → on Firestore failure, best-effort `deleteBlob`. Deletes go the other way: Firestore first, then blob (an orphan is recoverable by the sweep script; a dangling pointer is not).
4. **Download:** the assignment detail page's teacher-file link (`assignments/[id]`) becomes a click handler that fetches the blob on demand when `attachmentBlobKey` is set (same pattern as `lessonNoteAttachment.ts`), with a loading state and error text; the inline `href` path stays for old/small files. The lesson-note download gains the same branch.
5. **Delete cascades:** lesson note delete (`FormModal.tsx` batch), replacing a note's file, replacing or removing an assignment attachment → call `deleteBlob` for the old key after the Firestore commit.
6. **Role gate (D9):** the large-file path is offered only when the signed-in role is `senior_teacher`, `regular_teacher` or `institution_admin` (a `canUploadLargeFiles(role)` helper next to `roleCapabilities.ts`); other roles keep 500 KiB. Spectators already see no upload controls.
7. **Upload UX:** "Uploading 4.8 MB…" state, disable submit while uploading, warn that closing the tab cancels the upload (the SDK keeps the pending write in memory only).
8. **Session-lock interaction:** the 7 MB write shares the websocket with the lock. QA must test an upload on a throttled connection while the lock is held (§9).

---

### 5.1 Status: Phase 3 built (2026-10-09)

Nothing in the UI calls it yet (Phases 4 and 5 wire the forms). As built:

- `roleCapabilities.ts`: `canUploadLargeFiles(role)` is true for `institution_admin`, `senior_teacher` and `regular_teacher` only.
- `documentUpload.ts`: `processDocumentUpload(file, { large })` with a `LargeUploadPolicy` of `'none'` (default; 500KB, so students and submissions are untouched), `'enabled'` (5MB, 7,000,000-character output) or `'unconfigured'` (a file over 500KB is refused with a message naming `VITE_FIREBASE_DATABASE_URL`, D11). Also `needsBlobStore(size)` (true over 500 KiB), `uploadLimitLabel(policy)` for the "500KB max" helper text, and the new constants. `ProcessedDocument` is unchanged.
- `blobStoreLogic.ts` (pure): paths, the 200 MB / 900 MB budgets (a test pins them to `database.rules.json`), `newBlobKey` (UUID), `checkBudget`, `buildPutUpdate` / `buildDeleteUpdate` (the file and both counters in one multi-path update, deletes floored at 0), `isPermissionDenied`, `policyFor(role, hasDatabaseUrl)`.
- `blobStore.ts` (SDK wrapper, lazily imports `firebase/database`): `putBlob` (checks the budgets, then writes; a refused write means a counter moved, so it re-reads and retries up to 3 times with the same key; 120 s timeout), `getBlobDataUrl` (exact-path `get()` only, never a listener), `deleteBlob` (best effort, never throws), `largeUploadPolicy(role)`. It fails closed with a clear message when the database is unreachable or unconfigured.
- `firebase.ts` types: `LessonNoteAttachmentDocument` has optional `dataUrl` and `blobKey`; `AssignmentDocument` has `attachmentBlobKey`.
- `lessonNoteAttachment.ts` already downloads a note's file by key when `blobKey` is present (the small piece of Phase 4's download that the type change required).

Tests: `blobStoreLogic.test.ts`, `blobStore.test.ts` (against an in-memory stand-in for the database), additions to `documentUpload.test.ts` and `roleCapabilities.test.ts`. Seven deliberate breaks (dropping the global counter, letting students upload, removing the retry, ignoring the policy, a changed cap, allowing an unconfigured upload, an unfloored delete) each fail a test. **Not proven:** a real upload against the deployed rules.

### 5.2 Status: Phase 4 built, lesson notes (2026-10-09)

- **Form (`LessonNoteForm.tsx`):** the role's policy (`largeUploadPolicy(role)`) is passed to `processDocumentUpload`, the helper text shows the real limit (`5MB` for teachers and institution admins, `500KB` otherwise) and file sizes read as KB or MB. Saving goes through `commitWithBlob`: a file over 500 KB is uploaded first, then the note, its file record and its audit entry are written in the same single batch as before; if that batch fails the upload is taken back out. The file record is built by `attachmentData(file, blobKey)`, which writes a key or the embedded body, never both. While the file is sent the button reads "Uploading file…" and a "keep this window open" line shows.
- **Replacing or removing a file on edit:** the old file's key is read once (`existingBlobKey`, only when a file is replaced or removed), before the save, and the old file is deleted from the Realtime Database only after the save succeeds. Editing a note without touching its file costs nothing extra.
- **Deleting a note (`FormModal.tsx`):** the key is read first, the two records are deleted in one batch, then the file is deleted.
- **View dialog and download:** sizes use `formatFileSize`, a large file shows "may take a moment" while downloading, and the download (already keyed from Phase 3) fetches by key only when clicked.
- **Helpers added:** `commitWithBlob` in `blobStore.ts` (reusable for assignments), `lessonNoteFile.ts` (`attachmentData`, `existingBlobKey`), `formatFileSize` in `documentUpload.ts`.
- **Tests:** `lessonNoteFile.test.ts`, `commitWithBlob` cases in `blobStore.test.ts`, `formatFileSize` cases, and `lessonNoteLargeFiles.test.ts` (reads the form, delete flow and dialog as text and pins the order: upload before the save, old key read before and old file removed after, no key and body together). Six deliberate breaks each fail a test. `e2e/09-lesson-notes.spec.ts` was updated for the new teacher limit text and the 5 MB rejection (not run here).
- **Not covered:** a real large upload, replace or delete against the deployed rules; no e2e uploads a large file (e2e shares the production Realtime Database). Students and parents download a note's file by key with no role check, as designed (D3).

### 5.3 Status: Phase 5 built, assignments (2026-10-09)

- **Form (`AssignmentForm.tsx`):** same policy and wording as the lesson-note form (`largeUploadPolicy(role)`, "5MB max" for teachers and institution admins, "500KB max" otherwise, which this form did not show before, and readable sizes). The attachment is held as a body or, for an existing large file, just its key (`attachmentBlobKey`); an `attachmentChanged` flag records whether a file was chosen or removed in this form, so **saving an assignment without touching a large file never re-uploads it**. The attachment fields are built at save time by `assignmentAttachmentFields` (a body or a key, never both; the other kind is cleared on update; nothing cleared on create), and the write goes through `commitWithBlob`: a new large file is uploaded first and taken back out if the save fails.
- **Replacing or removing:** the old file's key is already on the assignment (`data.attachmentBlobKey`), so unlike lesson notes **no extra read** is needed; the old file is deleted only after the save succeeds.
- **Deleting an assignment (`FormModal.tsx`, admin-level only by the rules):** one read for the key (`existingAssignmentBlobKey`), then the delete, then the file. The assignment's submissions and attempts are not cascaded by the app, as before; they stay inline.
- **Assignment page:** a new `AssignmentAttachment` component replaces the inline download link. A small file still downloads from the embedded body; a large one is fetched by key only when Download is clicked (with a wait hint and an error line). Every role that can open the assignment (student, parent, teacher, admin, spectator) uses it. The shared saver `saveDataUrl` (`downloadFile.ts`) is now used here and by the lesson-note download.
- **Submissions:** unchanged. `submissions.ts` still calls `processDocumentUpload(file)` with the default 500KB policy; a test asserts it never mentions the blob store or a key.
- **Tests:** `assignmentFile.test.ts`, `downloadFile.test.ts` and `assignmentLargeFiles.test.ts` (reads the form, delete flow, page component and `submissions.ts` as text and pins the order: upload before the save, old file removed after, no key and body together, submissions unchanged). Eight deliberate breaks each fail a test. No e2e spec asserted the old assignment attachment markup, so none changed.
- **Not covered:** a real large upload, replace or delete of an assignment attachment against the deployed rules.

## 6. RTDB rules (written and deployed, Phase 1)

Status: **deployed to `school-sms-v1-default-rtdb` on 2026-10-09** (`firebase deploy --only database --project school-sms-v1`, released successfully). Implemented in `database.rules.json`, pinned by `src/lib/__tests__/databaseRules.test.ts` (24 tests, mutation-checked), and accepted by `firebase deploy --only database --dry-run --project school-sms-v1` ("rules syntax … is valid", 2026-10-09). **Not yet exercised by a real write**: there is no emulator, and the multi-path counter rules rely on `newData.parent()` showing the post-write database. That must be checked once against a real RTDB (Phase 1 deploy / Phase 3 smoke test).

### 6.1 What the rules say (file is the source of truth)

- **Top level and `/sessions`:** unchanged (deny by default; the lock stays owner-only).
- **`/files/$institutionId/$blobKey`**
  - `.read`: any signed-in user, by exact path only. There is no rule at `/files` or `/files/$institutionId`, so nothing can be listed.
  - `.write`: signed-in, and **create or delete only**. Create: the blob does not exist yet. Delete: it exists and the new value is empty. Replacing is impossible.
  - `.write` also ties the counters in the same multi-path update: on create `usage/institutions/$institutionId/bytes` and `usage/total/bytes` must each become their previous value (0 if absent) plus the blob's `size`; on delete each must drop by the old `size` (floored at 0). `newData.parent().parent().parent()` is used to read the post-write counters; `root` the pre-write ones.
  - `.validate`: `$institutionId` 1–128 characters; `$blobKey` a lower-case UUID; exactly the fields `dataUrl`, `size`, `mimeType`, `uploadedAt`, `uploadedBy` (anything else rejected); `mimeType` one of the six allowed types; `dataUrl` starts with `data:<its mimeType>;base64,` and is at most 7,000,000 characters **and** at most `size × 4/3 + 100` characters (so a small declared `size` cannot hide a large payload); `size` a number in 1–5,242,880; `uploadedAt === now`; `uploadedBy === auth.uid`.
- **`/usage/institutions/$institutionId/bytes`:** readable by signed-in users; writable (never deleted) with a number 0–200,000,000.
- **`/usage/total/bytes`:** same, capped at 900,000,000.

Checked by the test: the lint pins each of the above (including that the UUID and MIME regexes accept and reject sample values), and the mutation checks confirm it fails if listing is allowed, an update branch is added, `uploadedBy` is dropped, a cap is raised, or a counter clause is removed.

Known edge: two uploads to the same institution at the same moment both read the same counter, so the second write is refused by the rule; `putBlob` must re-read the counter and retry (§5).

### 6.2 What these rules do and do not give

- Give: no listing, no overwrite, MIME and size validation, key format, `uploadedBy` = the caller, a hard upper bound on the per-institution and global counters.
- Do **not** give: any check of the caller's role, class, parent link or institution. Any signed-in account (including a student with the web config) that learns a key can read the file, and any signed-in account can create blobs under any `institutionId`. D9's role limit is therefore UI-only.

### 6.3 Budgets — what they really are

The blob write and the two counter updates are one multi-path `update()`, so rules can compare each post-write counter with its pre-write value plus the blob `size` (via `root` / `newData.parent()…`). This makes honest clients accountable and stops accidental overuse, and the global ceiling keeps all schools together under the 1 GB limit. It does **not** stop a hostile signed-in user: the `institutionId` in the path is self-declared and the counter nodes are client-writable. True enforcement would need a mirrored `users/{uid}/institutionId` tree (rejected, D12) or Blaze/Cloud Functions.

---

## 7. Firestore rules changes

**Status (2026-10-09): written and deployed** (`firebase deploy --only firestore:rules --project school-sms-v1`, released; it also carried the already-merged spectator read rules). Implemented in `firestore.rules`, pinned by `src/lib/__tests__/largeAttachmentRules.test.ts` (15 tests; mutation-checked: allowing both fields, dropping `blobKey` from `hasOnly`, an unchecked assignment key, a raised size cap, a blob key on a submission and a loosened UUID pattern each fail it). `firebase deploy --only firestore:rules --dry-run --project school-sms-v1` compiles. As built:

- New helpers `isValidBlobKey(k)` (lower-case UUID, the same pattern as `database.rules.json`) and `isValidAttachmentSize(n)` (number, 0 to 5,242,880; 0 is allowed because older assignment records saved without a size read back as 0).
- Lesson-note file: `hasOnly(['dataUrl','blobKey','fileName','mimeType','size'])`, a valid size, and **exactly one** of an inline `dataUrl` (existing 700,000-character check) or a valid `blobKey`.
- `isValidLessonNote`: the optional `attachmentSize` on the note itself must be a valid size.
- Assignment create/update: optional `attachmentBlobKey` must be a valid key and may not accompany `attachmentDataUrl`; optional `attachmentSize` must be a valid size.
- Submissions, attempts and tombstones: untouched, and a test asserts they never mention a blob key.

The original plan, kept for reference:

- Add `isValidBlobKey()` helper; keep `isValidAttachmentDataUrl()` unchanged (700,000-char inline cap).
- Lesson-note `attachment/{docId}` create/update: `hasOnly` becomes `['dataUrl','blobKey','fileName','mimeType','size']`, with "exactly one of dataUrl / blobKey" and `size <= 5242880`.
- Assignment create/update: optional `attachmentBlobKey` (valid key), not together with `attachmentDataUrl`.
- Submission and attempt rules: **no change** (students stay on the 500 KiB inline path).
- Spectator read rules need no change: they read the same documents. Spectators and parents must never write blobs (UI hides upload controls; RTDB cannot enforce it).
- Update the static rules tests accordingly.

---

## 8. Retention and cleanup

- Lesson-note and assignment documents are deleted by their owners (no TTL applies to them), but a failed or abandoned upload, a crashed tab, or a delete whose follow-up blob removal failed leaves an RTDB blob nobody references. Firestore never touches RTDB, so these **orphans** must be swept.
- **Why a grace period (D13).** Upload order is RTDB first, Firestore second (D10). Between the two writes a blob legitimately exists with no Firestore reference yet, and a slow or paused upload widens that gap. The sweep cannot tell "in flight" from "orphaned", so it only deletes unreferenced blobs whose `uploadedAt` is older than **7 days**. Shorter risks deleting a file whose record is still being written; longer keeps orphans in the 200 MB budget.
- New owner-run Admin SDK script `scripts/sweep-orphan-blobs.mjs` (dry-run by default, `--key=`): lists `files/{institution}` keys, builds the set of keys referenced in Firestore (lesson-note attachment docs, assignments' `attachmentBlobKey`), reports/deletes unreferenced blobs older than the grace period, and recomputes `usage/institutions/{institution}/bytes` and `usage/total/bytes` from what remains.
- `trim-old-submission-attachments.mjs` and the submission TTL are **unchanged**: submissions never use RTDB.
- No scheduled execution is possible on Spark; the owner runs the sweep (as with the existing scripts). A calendar reminder is recommended.

### 8.1 Status: Phase 6 built (2026-10-09)

**`scripts/sweep-orphan-blobs.mjs`** (owner-run; `node scripts/sweep-orphan-blobs.mjs --key=<path> --project=<id> [--apply] [--grace-days=7] [--database-url=<url>] [--allow-no-references]`). Its decisions are in `scripts/sweepOrphanBlobsLogic.mjs` (with a type file for the tests).

- **Dry run unless `--apply`.** The default is off; the report shows counts, sizes and the first 8 characters of a key, never a full key or a file body.
- **Lists without downloading.** A shallow REST listing of `files` and `files/{institution}`, then only each file's `size` and `uploadedAt`.
- **References:** every `lessonNotes/*/attachment/*.blobKey`, any file id and not only `data` (one collection-group read of just that field) and every assignment's `attachmentBlobKey` (an ordered query per institution that returns only assignments with one). A file is matched by institution **and** key.
- **Sorting:** referenced (kept); unreferenced and uploaded within the grace period (kept, "recent"); unreferenced with no usable `uploadedAt` (kept, reported); unreferenced and older than the grace period (orphan, deleted with `--apply`). `--grace-days` below 1 is refused.
- **Safety:** refuses if `--project` is not the key's project; stops before any delete if the Firestore reads fail; refuses to delete when no reference at all was found but orphans exist (a probable failed read) unless `--allow-no-references`; never writes to Firestore; reports "dangling" records (a record whose file is missing) without changing them.
- **Counters:** compares each counter with the sum of the files that remain and, with `--apply`, corrects it inside a transaction that only commits if the counter is unchanged since it was read (an upload during the run leaves it alone and says to run again). Counters with no files left go to 0.
- **Cost:** Firestore reads are one per lesson-note file record plus one per assignment with a large file; the Realtime Database reads are a few bytes per file.
- **Tests:** `sweepOrphanBlobs.test.ts` (25 tests) pins the sorting rules, the grace boundary, the counter plan and the script's safety properties as text; eight deliberate breaks each fail it. **Dry run against production (2026-10-09, read-only):** 0 stored files, 0 references, 0 orphans, counters all match. It proves the sign-in to the database, the shallow listing and every Firestore query (the lesson-note collection-group read and the per-institution assignment query) work with no missing index. It does not exercise the file-reading, sorting or `--apply` paths, because the store is still empty; rerun it after the first real uploads.

**Documentation updated (§10):** `docs/compliance/LEGAL_AND_PRIVACY_COMPLIANCE.md` (processor row, data table row for the new store, retention gap), `docs/backend/BACKEND_ARCHITECTURE_SPEC.md` (files, retention, BE files phase), `docs/backend/PII_SPLIT_DESIGN.md` (risks), `docs/firebase/firebase-rules.md` (a Realtime Database rules section), `docs/project-overview/ROLE_PRIVILEGE_ANALYSIS.md` (the UI-only role limit), `docs/ISSUES_AND_GAPS.md` (#46) and a pointer at the top of the lesson-notes and assignments feature specs. `docs/project-overview/sms-role-specification-v1.md` was not changed (it is a role specification, not a rules or storage description). `.env.example` was updated in Phase 0.

---

## 9. Free-tier analysis

| Resource         | Limit (Spark)                          | Effect                                                                                                                                                                                     |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RTDB stored      | 1 GB (separate from Firestore's 1 GiB) | ~150 files at the maximum size overall; 200 MB per school ≈ 30 maximum-size files (more for typical files). Only ~5 schools can fill their budgets, hence the ~900 MB global ceiling (D7). |
| RTDB download    | 10 GB / month                          | One 5 MiB file ≈ 6.7 MB on the wire. A class of 30 opening one max-size note ≈ 200 MB; ~50 such events exhaust the month. Downloads happen only on click, never on page load.              |
| RTDB connections | 100 simultaneous                       | Unchanged by this feature (the lock already holds one per tab); uploads/downloads reuse that connection. The URL is now required everywhere (D11).                                         |
| Firestore        | reads/writes                           | Fewer bytes per read for large files; no extra reads/writes beyond today's metadata.                                                                                                       |
| Exhaustion       | RTDB disabled until reset              | Large uploads/downloads fail; the session lock fails open; inline (≤ 500 KiB) files and student submissions keep working (D2).                                                             |

Mitigations to consider if usage grows (deferred, D8): lower default cap (2 MiB), cap tuning, client-side image downscaling, link-out for big decks (lesson notes already support links).

Upload on a slow link can delay lock heartbeats; options: serialise uploads, show a "keep this tab open" notice, or lower the cap if QA shows lock drops.

---

## 10. Security and compliance notes

- Student submissions are **not** moved, so children's work keeps today's per-role Firestore enforcement. RTDB holds teacher-authored material only.
- The capability model means a leaked key (screenshot, a former user's browser history of fetches) grants access to that file until it is deleted. Keys are never put in URLs or logs by the app; they live only in Firestore documents protected by existing rules. Any signed-in account can still write blobs (§6.2), including unwanted ones, within the budgets.
- Update `docs/compliance/` (data-class table, retention): a second store, no per-role enforcement on it, cleanup depends on an owner-run sweep.
- Update `docs/backend/` PII-split design: RTDB blobs are an interim store until Blaze/Storage or the planned backend.
- Update `ROLE_PRIVILEGE_ANALYSIS` / `firebase-rules.md` for the new rule set and the UI-only role limit (D9).
- Magic-byte sniffing remains the only content check (no re-encoding for PDF/DOCX/PPTX). A 5 MiB cap raises the blast radius of a malformed file; downloads are saved as files, never rendered inline.

---

## 11. Implementation plan

| Phase | Work                                                                                                                                                                                                                                                    | Deploy                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 0     | **Done in part (2026-10-09), see §11.1.** Quotas confirmed from official docs; dev/e2e env files already carry the URL; Vercel production, the console check and the dev/e2e instance choice remain with the owner.                                     | —                                        |
| 1     | **Done and deployed (2026-10-09), see §6.** `database.rules.json` + `databaseRules.test.ts`. Still to do: one real multi-path write (Phase 3 smoke test) to confirm the counter rules.                                                                  | `firebase deploy --only database`        |
| 2     | **Done and deployed (2026-10-09), see §7.** Firestore rules + `largeAttachmentRules.test.ts`. Additive: accepts the blob-key fields, nothing writes them yet.                                                                                           | `firebase deploy --only firestore:rules` |
| 3     | **Done in code, not wired to any form (2026-10-09), see §5.1.** `documentUpload.ts` policy, `blobStoreLogic.ts`, `blobStore.ts`, `canUploadLargeFiles`, type changes, unit tests. Still to do: one real upload against the deployed rules (smoke test). | —                                        |
| 4     | **Done in code (2026-10-09), see §5.2.** Lesson-note form, delete cascade, view dialog and download. Not deployed (the app is not merged) and not exercised against the real database.                                                                  | —                                        |
| 5     | **Done in code (2026-10-09), see §5.3.** Assignment form, delete cascade and the attachment on the assignment page; submissions untouched. Not deployed and not exercised against the real database.                                                    | —                                        |
| 6     | **Done in code and docs (2026-10-09), see §8.1.** `scripts/sweep-orphan-blobs.mjs` and the documentation updates from §10. A read-only dry run against production on 2026-10-09 found the store empty (see §8.1).                                       | owner runs script                        |
| 7     | QA on a disposable institution: max-size upload on a throttled network with the lock on, replace/delete orphans, student/parent read paths, spectator read-only, counters, sweep.                                                                       | merge (Vercel)                           |

### 11.1 Phase 0 results (2026-10-09)

| Item                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spark RTDB quotas          | **Confirmed on the official pages** ([pricing](https://firebase.google.com/pricing), [limits](https://firebase.google.com/docs/database/usage/limits)): 1 GB stored; 10 GB/month download (also shown as a 360 MB/day cap — see below); 100 simultaneous connections; string 10 MB; SDK write 16 MB (REST 256 MB); **multiple databases per project are not available on Spark.** The "verify" caveats in §2 and §12 are resolved. The console's Usage tab was not checked (needs the owner). |
| Daily download cap         | The pricing page shows **360 MB/day** alongside the 10 GB/month figure (about the same as 10 GB ÷ 30 ≈ 333 MB/day). It is a _daily_ limit, so a busy day cannot borrow from the rest of the month: a class of 30 opening one max-size note (~200 MB, §9) uses over half a day's allowance. §9 should be read with this daily cap in mind.                                                                                                                                                     |
| `.env` (local, gitignored) | Already sets `VITE_FIREBASE_DATABASE_URL` to the **production** project (`school-sms-v1-default-rtdb`) and `VITE_SINGLE_SESSION_ENABLED="true"`. `.env.development` / `.env.production` do not set them. So a local `npm run dev` and Playwright's webServer (`npm run dev`) already satisfy D11 — against **production** RTDB, with the session lock on.                                                                                                                                     |
| `.env.qa`                  | E2E credentials only; no RTDB values. e2e therefore uses whatever `.env` gives the dev server (production).                                                                                                                                                                                                                                                                                                                                                                                   |
| `.env.staging` (local)     | Holds a separate Firebase project, `sms-staging-301a0`, with its own RTDB URL (key listed twice) and an empty `VITE_SINGLE_SESSION_ENABLED`. It is not referenced by any npm script, doc or `firebase` alias (`.firebaserc` only has `default: school-sms-v1`). Whether that project has a Realtime Database created and rules deployed is unknown.                                                                                                                                           |
| `.env.example`             | Updated: it said to leave the URL unset in dev/CI, which contradicted D11. It now says the URL is required everywhere and that only the lock flag stays production-only.                                                                                                                                                                                                                                                                                                                      |
| Vercel production          | **Not verifiable from here** (no dashboard/CLI access). `docs/ISSUES_AND_GAPS.md` states production sets both variables (PR #70 shipped the lock). Owner to confirm in Vercel → Settings → Environment Variables that `VITE_FIREBASE_DATABASE_URL` is set for Production (and Preview, if previews should upload large files).                                                                                                                                                                |
| Vercel previews            | `BACKEND_ARCHITECTURE_SPEC` records that previews use production Firebase, so previews need the variable too if they are to work.                                                                                                                                                                                                                                                                                                                                                             |

**Consequence for the open instance question (§13):** because Spark has one database per project, a _separate_ dev/e2e RTDB means pointing those runs at the staging project (`sms-staging-301a0`). That project would also need Auth users, Firestore data and rules matching the app, i.e. a real staging setup (planned in the security report/backend spec, not built). Until then, dev and e2e share the production RTDB and its 1 GB, and e2e uploads must be cleaned up (sweep script, §8) or kept small.

**Deploy order:** (1) RTDB rules, (2) Firestore rules, (3) merge/app with the URL env var set, (4) owner-run sweep dry-run. Rules first because they are additive and the app depends on them. **Rollback:** revert the app; Firestore documents that hold a blob key need the new app to be opened, so revert only before real use or keep the read path.

**Tests to add:** `documentUpload` caps/kinds per role; `blobStore` (mocked SDK: ordering, rollback on Firestore failure, no listener); `canUploadLargeFiles`; static RTDB-rules lint (no parent read, create-only, size/MIME validation, `uploadedBy`); Firestore rules text tests for the new fields; page tests that large files use the on-demand download; e2e: upload > 500 KiB and ≤ 5 MiB as a teacher (needs the RTDB URL in the run) and a student confirming 500 KiB.

---

## 12. Deferred / not decided

- Role/institution mirror in RTDB for real per-role enforcement.
- Per-user upload quotas and rate limits.
- Compression / image downscaling.
- Moving to Firebase Storage (Blaze) or the planned backend; a one-off migration script then.
- Student submissions in RTDB (decided against for now).
- Multiple files per lesson note (now technically possible; out of scope).
- Read auditing of blob downloads.
- Verifying the official Spark RTDB storage/download figures and the 16 MB SDK write limit on the English docs page.

---

## 13. Decisions on the open questions (owner, 2026-10-09)

| #   | Question                                     | Answer                                                                                                                                                                |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Per-institution cap                          | **200 MB**, plus a global ceiling counter (D7).                                                                                                                       |
| 2   | Which roles get large files from day one     | **Teacher-related and admin-related roles:** `senior_teacher`, `regular_teacher`, `institution_admin`. Spectator and parent read-only; student stays at 500 KiB (D9). |
| 3   | Orphan sweep grace period                    | **7 days**, from a server-set `uploadedAt` (D13). Who runs it and how often is still open (owner-run, suggested monthly).                                             |
| 4   | Capability key for student submissions       | **Submissions stay at 500 KiB**; only teacher/admin uploads move to RTDB.                                                                                             |
| 5   | Disable large files where no RTDB URL is set | **No.** The URL is required in every environment (D11).                                                                                                               |

**Assumption to confirm:** `super_admin` was not named in the role answer and is treated as excluded from large uploads (it does not normally author lesson notes or assignments).

**Still open:** which RTDB instance dev and e2e use. Today they use the production one via the local `.env` (§11.1). A separate instance means the staging project `sms-staging-301a0` (Spark allows one database per project), which is not yet a working staging environment.
