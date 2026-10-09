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
| Lesson notes    | file in `lessonNotes/{id}/attachment/data` (`dataUrl, fileName, mimeType, size`), fetched only on download, never via React Query | `LessonNoteForm.tsx`, `lessonNoteAttachment.ts` |
| Assignment file | inline on the assignment doc (`attachmentDataUrl`, …) — read by every list query that returns assignments                         | `AssignmentForm.tsx`, rules ~1428               |
| Submissions     | `fileDataUrl` inline on `submissions/{studentId}` and on `attempts/{n}` — **unchanged by this spec**                              | `submissions.ts`, rules ~1467–1510              |
| RTDB today      | only `/sessions/{uid}` for the single-session lock; SDK imported lazily; needs `VITE_FIREBASE_DATABASE_URL`                       | `sessionLock.ts`, `database.rules.json`         |
| Cache           | React Query persists to `sessionStorage` (~5 MB) → file bodies must never go through it                                           | `queryClient.ts`                                |

Arithmetic: 5 MiB = 5,242,880 bytes → base64 = 6,990,508 chars (+ ≤ ~90-char `data:` prefix). That fits RTDB's 10 MB string limit and 16 MB SDK write limit, and cannot fit one Firestore document (1 MiB).

External limits (verify before relying; see §12): RTDB string 10 MB, SDK write 16 MB, key 768 bytes, depth 32, **Spark 100 simultaneous connections**, Spark 1 GB stored and 10 GB/month downloaded (third-party sources). Cloud Storage for Firebase requires Blaze.

---

## 3. Decisions

| #   | Decision                                                                                                                                                                                                                                            | Reason                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | File bodies > 500 KiB go to **RTDB**; Firestore keeps only metadata + a blob key.                                                                                                                                                                  | Owner choice.                                                                                                                                   |
| D2  | **Hybrid:** files ≤ 500 KiB stay inline in Firestore exactly as today.                                                                                                                                                                              | Old data, tests and rules keep working; nothing to migrate.                                                                                     |
| D3  | **Access model = unguessable key (capability).** `blobKey = crypto.randomUUID()` (never a push ID: push IDs are time-ordered and partly guessable). Whoever can read the Firestore doc can learn the key.                                           | Owner choice. RTDB rules cannot read Firestore and there are no custom claims, so role / class / parent-link rules cannot be evaluated on RTDB. |
| D4  | **No parent `.read`** on `/files/**`: a file is readable only by exact path, never listed.                                                                                                                                                          | Prevents enumeration; avoids accidental 7 MB × N downloads.                                                                                     |
| D5  | **Create-only.** A blob cannot be overwritten; replacing a file means a new key. Delete is allowed by key.                                                                                                                                          | No silent tampering.                                                                                                                            |
| D6  | **Same limit for every type** (PDF, DOCX, PPTX, JPEG, PNG, WEBP): 5 MiB.                                                                                                                                                                            | Owner choice.                                                                                                                                   |
| D7  | **Budgets:** 200 MB per institution (`/usage/{institutionId}/bytes`) **and** a global ceiling (`/usage/_total/bytes`, ~900 MB, under the 1 GB Spark limit), both updated in the same multi-path write as the blob (§6.3).                           | Owner choice. Honest limit: accounting, not authentication (§6.3).                                                                              |
| D8  | **Quota exhaustion risk is accepted** beyond the two budgets. Monitor; no per-user caps in v1.                                                                                                                                                      | Owner choice.                                                                                                                                   |
| D9  | **Who may upload large files:** `senior_teacher`, `regular_teacher`, `institution_admin`. `super_admin` is not listed and is treated as excluded (assumption, §13). `student` stays at 500 KiB; `parent` and `spectator` are read-only.            | Owner choice. **UI-enforced only:** RTDB rules cannot tell roles apart (§6.2), so this is a client check, not a security boundary.               |
| D10 | **Fail closed on upload:** the RTDB write is acknowledged **before** the Firestore write; if RTDB is unreachable the upload fails with a clear message. (The session lock fails open; this must not.)                                                | Never create a Firestore pointer to a missing file.                                                                                             |
| D11 | **`VITE_FIREBASE_DATABASE_URL` is required in every environment** (dev, e2e, production) so large files are never silently disabled. Without it a >500 KiB upload shows a clear configuration error; ≤ 500 KiB uploads are unaffected.             | Owner choice (large files must not be disabled). Dev/e2e must point at an RTDB instance (a dev/QA one is preferable to production).             |
| D12 | No role mirror in RTDB (rejected).                                                                                                                                                                                                                  | Second source of truth, drift = security bug.                                                                                                   |
| D13 | **Orphan grace period = 7 days**, measured from a server-set `uploadedAt` stored on every blob (§6, §8).                                                                                                                                            | Owner choice. See §8 for why a grace period exists.                                                                                             |

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
/usage/{institutionId}/bytes = 12345678   // running total of raw bytes, ≤ 200 MB
/usage/_total/bytes          = 98765432   // all institutions, ≤ ~900 MB
```

`_total` is a reserved name; real institution IDs are Firestore auto-IDs and cannot collide with it.

### 4.2 Firestore changes (additive)

| Document                           | New optional field                                 | Rule                                 |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------ |
| `lessonNotes/{id}/attachment/data` | `blobKey` **instead of** `dataUrl`                 | exactly one of `dataUrl` / `blobKey` |
| `assignments/{id}`                 | `attachmentBlobKey` instead of `attachmentDataUrl` | at most one                          |

Submissions and attempts are **not** changed.

Common new rule helper `isValidBlobKey(k)`: `k is string && k.matches('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')`. The lesson-note `size` and assignment `attachmentSize` get `is number && <= 5242880`.

`src/lib/firebase.ts` types gain the optional key fields; `LessonNoteAttachmentDocument.dataUrl` and `AssignmentDocument.attachmentDataUrl` stay optional.

---

## 5. Client design

1. **`documentUpload.ts`:** `processDocumentUpload()` takes the caller's cap. Teacher/admin callers (lesson note, assignment attachment) allow up to 5 MiB and return `{ kind: 'blob' | 'inline', … }` (inline when ≤ 500 KiB, current behaviour). The student submit path keeps the 500 KiB cap. Constants split: `MAX_INLINE_BYTES` (500 KiB), `MAX_BLOB_BYTES` (5 MiB). The "500KB max" strings in `LessonNoteForm` and `AssignmentForm` follow the active cap; the student submit UI text is unchanged.
2. **New `src/lib/blobStore.ts`** (lazy `import('firebase/database')`, like `sessionLock.ts`):
   - `putBlob(institutionId, processed)` → generates the key, does ONE multi-path `update()` writing `files/{inst}/{key}` (with `uploadedAt`, `uploadedBy`), `usage/{inst}/bytes` and `usage/_total/bytes`; awaits the ack with a generous timeout (large payload, slow school network); returns the key.
   - `getBlobDataUrl(institutionId, key)` → exact-path `get()`; returns the data URL. Never a listener, never React Query.
   - `deleteBlob(institutionId, key, size)` → multi-path remove + both counter decrements, best-effort.
3. **Write order (D10):** `putBlob` → Firestore batch (metadata + key) → on Firestore failure, best-effort `deleteBlob`. Deletes go the other way: Firestore first, then blob (an orphan is recoverable by the sweep script; a dangling pointer is not).
4. **Download:** the assignment detail page's teacher-file link (`assignments/[id]`) becomes a click handler that fetches the blob on demand when `attachmentBlobKey` is set (same pattern as `lessonNoteAttachment.ts`), with a loading state and error text; the inline `href` path stays for old/small files. The lesson-note download gains the same branch.
5. **Delete cascades:** lesson note delete (`FormModal.tsx` batch), replacing a note's file, replacing or removing an assignment attachment → call `deleteBlob` for the old key after the Firestore commit.
6. **Role gate (D9):** the large-file path is offered only when the signed-in role is `senior_teacher`, `regular_teacher` or `institution_admin` (a `canUploadLargeFiles(role)` helper next to `roleCapabilities.ts`); other roles keep 500 KiB. Spectators already see no upload controls.
7. **Upload UX:** "Uploading 4.8 MB…" state, disable submit while uploading, warn that closing the tab cancels the upload (the SDK keeps the pending write in memory only).
8. **Session-lock interaction:** the 7 MB write shares the websocket with the lock. QA must test an upload on a throttled connection while the lock is held (§9).

---

## 6. RTDB rules (sketch — must be finalised and tested)

### 6.1 `database.rules.json` additions

```json
"files": {
  "$institutionId": {
    "$blobKey": {
      ".read": "auth != null",
      ".write": "auth != null && ((!data.exists() && newData.exists()) || (data.exists() && !newData.exists()))",
      ".validate": "!newData.exists() || (newData.hasChildren(['dataUrl','size','mimeType','uploadedAt','uploadedBy']) && newData.child('dataUrl').isString() && newData.child('dataUrl').val().length <= 7000000 && newData.child('dataUrl').val().matches(/^data:(application\\/pdf|application\\/vnd\\.openxmlformats-officedocument\\.(wordprocessingml\\.document|presentationml\\.presentation)|image\\/(jpeg|png|webp));base64,/) && newData.child('size').isNumber() && newData.child('size').val() <= 5242880 && newData.child('uploadedAt').val() === now && newData.child('uploadedBy').val() === auth.uid)",
      "$other": { ".validate": false }
    }
  }
},
"usage": {
  "$institutionId": {
    "bytes": { ".read": "auth != null", ".write": "auth != null", ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 200000000" }
  },
  "_total": {
    "bytes": { ".read": "auth != null", ".write": "auth != null", ".validate": "newData.isNumber() && newData.val() >= 0 && newData.val() <= 900000000" }
  }
}
```

(The `$blobKey` charset/length validation and the exact numeric literals are to be finalised; the top-level `.read/.write: false` stays. "200 MB" is taken as 200,000,000 bytes of raw file data.)

### 6.2 What these rules do and do not give

- Give: no listing, no overwrite, MIME and size validation, key format, `uploadedBy` = the caller, a hard upper bound on the per-institution and global counters.
- Do **not** give: any check of the caller's role, class, parent link or institution. Any signed-in account (including a student with the web config) that learns a key can read the file, and any signed-in account can create blobs under any `institutionId`. D9's role limit is therefore UI-only.

### 6.3 Budgets — what they really are

The blob write and the two counter updates are one multi-path `update()`, so rules can compare each post-write counter with its pre-write value plus the blob `size` (via `root` / `newData.parent()…`). This makes honest clients accountable and stops accidental overuse, and the global ceiling keeps all schools together under the 1 GB limit. It does **not** stop a hostile signed-in user: the `institutionId` in the path is self-declared and the counter nodes are client-writable. True enforcement would need a mirrored `users/{uid}/institutionId` tree (rejected, D12) or Blaze/Cloud Functions.

---

## 7. Firestore rules changes

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
- New owner-run Admin SDK script `scripts/sweep-orphan-blobs.mjs` (dry-run by default, `--key=`): lists `files/{institution}` keys, builds the set of keys referenced in Firestore (lesson-note attachment docs, assignments' `attachmentBlobKey`), reports/deletes unreferenced blobs older than the grace period, and recomputes `usage/{institution}/bytes` and `usage/_total/bytes` from what remains.
- `trim-old-submission-attachments.mjs` and the submission TTL are **unchanged**: submissions never use RTDB.
- No scheduled execution is possible on Spark; the owner runs the sweep (as with the existing scripts). A calendar reminder is recommended.

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

| Phase | Work                                                                                                                                                                                 | Deploy                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 0     | Confirm Spark RTDB quotas in the console; set `VITE_FIREBASE_DATABASE_URL` in Vercel production **and** in dev/e2e env files (D11); decide which RTDB instance dev/e2e use.           | —                                        |
| 1     | `database.rules.json` (§6) + static rules lint test; test the multi-path counter rules in a throwaway RTDB path or emulator.                                                         | `firebase deploy --only database`        |
| 2     | Firestore rules + tests (§7). Additive, accepts the blob-key fields.                                                                                                                 | `firebase deploy --only firestore:rules` |
| 3     | `documentUpload.ts` caps + `blobStore.ts` + `canUploadLargeFiles` + type changes + unit tests.                                                                                       | —                                        |
| 4     | Lesson notes: form, view modal, delete/replace cascade, download.                                                                                                                    | —                                        |
| 5     | Assignments: teacher attachment form, detail-page download, delete/replace cascade. (Submissions untouched.)                                                                         | —                                        |
| 6     | `sweep-orphan-blobs.mjs`, docs updates (§10).                                                                                                                                        | owner runs script                        |
| 7     | QA on a disposable institution: max-size upload on a throttled network with the lock on, replace/delete orphans, student/parent read paths, spectator read-only, counters, sweep.     | merge (Vercel)                           |

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

| #   | Question                                      | Answer                                                                                                                                                   |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Per-institution cap                           | **200 MB**, plus a global ceiling counter (D7).                                                                                                          |
| 2   | Which roles get large files from day one      | **Teacher-related and admin-related roles:** `senior_teacher`, `regular_teacher`, `institution_admin`. Spectator and parent read-only; student stays at 500 KiB (D9). |
| 3   | Orphan sweep grace period                     | **7 days**, from a server-set `uploadedAt` (D13). Who runs it and how often is still open (owner-run, suggested monthly).                                |
| 4   | Capability key for student submissions        | **Submissions stay at 500 KiB**; only teacher/admin uploads move to RTDB.                                                                                |
| 5   | Disable large files where no RTDB URL is set  | **No.** The URL is required in every environment (D11).                                                                                                  |

**Assumption to confirm:** `super_admin` was not named in the role answer and is treated as excluded from large uploads (it does not normally author lesson notes or assignments).

**Still open:** which RTDB instance dev and e2e use (a separate dev/QA instance is preferable, but Spark allows only one default RTDB instance per project).
