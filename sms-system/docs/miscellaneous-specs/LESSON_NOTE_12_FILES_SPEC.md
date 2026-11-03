# Lesson Notes: 12 Files, Download All and Download Quota Gate (Spec)

> **Status:** the first pull request (sections 4 and 5) is built, and its two rule changes are deployed. The second and third pull requests are design only. Written 2026-11-03 from a brainstorm with the owner, who made every decision in section 2.
> **Feature:** a lesson note can hold up to 12 files instead of 5. Anyone who can view a note can download all its files at once, within a shared monthly limit that protects the Firebase free tier. A student can read only the files of their own classes.
> **Hard constraint:** Firebase Spark only (no Blaze, no Cloud Functions, no Cloud Storage).
> **Primary roles:** `institution_admin`, `senior_teacher`, `regular_teacher` (attach files); `student`, `parent`, `spectator` (view and download).
> **Out of scope:** assignments keep one attachment; student submissions keep the 500 KB inline limit; custom claims and everything else that needs the backend (section 12).
> **Extends:** `LESSON_NOTES_FEATURE_SPEC.md` (section 11) and `LARGE_ATTACHMENTS_RTDB_SPEC.md`.

---

## 1. Overview

Three pull requests deliver this. Each stands on its own.

| Pull request | Delivers                                                                           | Sections   |
| ------------ | ---------------------------------------------------------------------------------- | ---------- |
| **First**    | 12 files per note, a clearer form, safer file deletes, a corrected storage ceiling | 4, 5       |
| **Second**   | Download quota gate, two kill switches, a local file store, Download all           | 6, 7, 8, 9 |
| **Third**    | Students read only their own classes' files                                        | 10         |

After the first release, a note can have 12 files and they download one at a time, as they do today.

### Why these limits

- **The 15 MB total stays.** Twelve files average about 1.25 MB each, and at most 3 can be full 5 MB files. So a note's maximum Realtime Database cost does not change, and the total usually runs out before the count.
- **Real use fits.** In the one school using the feature so far, about three-quarters of files are small enough to store inline, the largest note is under 6 MB, and at least one note was already at the 5-file limit.
- **The month is what matters.** Spark's Realtime Database allowance is 10 GB of downloads a month. The 360 MB/day figure in older docs is Hosting's limit and Blaze's no-cost allowance, not a Spark Realtime Database limit. Firebase's FAQ says that exceeding Spark limits in a calendar month shuts the app off for the rest of that month.

---

## 2. Decisions

| #   | Topic                              | Decision                                                                                                           |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| D1  | File limit                         | 12 per note, the same for every role that can write a note                                                         |
| D2  | Total per note                     | Stays at 15 MB; each file up to 5 MB; 500 KB inline limit unchanged                                                |
| D3  | School budget                      | Stays at 200,000,000 raw bytes. Review at 50% used, when a second school starts using large files, or after a term |
| D4  | Total ceiling                      | Lowered from 900,000,000 to 700,000,000 raw bytes, because storage holds base64, about 4/3 larger                  |
| D5  | File deletes                       | One at a time, never in parallel                                                                                   |
| D6  | Help text                          | Names the 15 MB total                                                                                              |
| D7  | Form meter                         | Shows files, size and percentage used. Shows upload progress while saving                                          |
| D8  | Download all on desktop            | One zip, no compression, for notes with 2 or more files                                                            |
| D9  | Download all on phones and tablets | One file at a time, about 1.5 seconds apart, chosen with `(pointer: coarse)`                                       |
| D10 | Controls                           | Sequential: Pause, then "Download next" or "Resume automatic", and Stop. Zip: Stop, then save or discard           |
| D11 | Progress                           | A styled native `<progress>` counting files processed                                                              |
| D12 | A file fails                       | Keep going, save what worked, and name the rest                                                                    |
| D13 | During a run                       | Tapping outside is ignored and does not close the dialog. The dialog says to keep it open                          |
| D14 | Repeat block                       | A note cannot be fetched in full twice before sign-out. Only missing files can be fetched                          |
| D15 | Local store                        | IndexedDB, about 50 MB per person, oldest removed first, cleared at sign-out                                       |
| D16 | SQLite                             | Not used. Possible future uses are in section 13                                                                   |
| D17 | Quota gate                         | A shared monthly counter, with confirmed thresholds (section 6)                                                    |
| D18 | Kill switches                      | Two separate flags. Reads block large-file downloads. Writes block new large uploads only                          |
| D19 | Student file reads                 | Limited to the student's classes. Parents and note metadata stay broad for now (section 10)                        |
| D20 | Custom claims                      | Designed here, built with the backend (section 12)                                                                 |
| D21 | Delivery                           | Three staged pull requests                                                                                         |
| D22 | Deploys                            | Each deploy runs only with the owner's approval. This feature only                                          |

---

## 3. Constants

| Name                            | Value                          | Where                                                      |
| ------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `MAX_LESSON_NOTE_FILES`         | `12`                           | `src/lib/lessonNoteFiles.ts`; mirrors `firestore.rules`    |
| `MAX_LESSON_NOTE_TOTAL_BYTES`   | `15 * 1024 * 1024` (unchanged) | `src/lib/lessonNoteFiles.ts`                               |
| `TOTAL_BUDGET_BYTES`            | `700_000_000`                  | `src/lib/blobStoreLogic.ts`; mirrors `database.rules.json` |
| `INSTITUTION_BUDGET_BYTES`      | `200_000_000` (unchanged)      | `src/lib/blobStoreLogic.ts`; mirrors `database.rules.json` |
| `BUDGET_WARNING_RATIO`          | `0.8`                          | `src/lib/blobStoreLogic.ts`                                |
| `DOWNLOAD_ALL_OFF_TOTAL_BYTES`  | `6_000_000_000`                | `src/lib/downloadGate.ts`                                  |
| `DOWNLOAD_ALL_OFF_SCHOOL_BYTES` | `3_000_000_000`                | `src/lib/downloadGate.ts`                                  |
| `DOWNLOADS_STOP_TOTAL_BYTES`    | `8_500_000_000`                | `src/lib/downloadGate.ts`                                  |
| `MAX_DOWNLOAD_STEP_BYTES`       | `7_100_000`                    | `src/lib/downloadGate.ts`; mirrors `database.rules.json`   |
| `SEQUENTIAL_GAP_MS`             | `1500`, tuned in step 0.4      | `src/lib/lessonNoteBulkDownload.ts`                        |
| `LOCAL_STORE_MAX_BYTES`         | `50 * 1024 * 1024`             | `src/lib/noteFileStore.ts`                                 |

---

## 4. First pull request: the limit and hardening

### 4.1 The limit

- `MAX_LESSON_NOTE_FILES` becomes 12. The form already reads the constant.
- `isValidLessonNote` changes to `d.attachments.size() <= 12`.
- **No migration.** `noteFiles()` reads a list of any length.

### 4.2 Safer file deletes

`LessonNoteForm` and `deleteRecord` start every Realtime Database delete at once. Each delete reads the counters and writes them, and the rules accept the write only if the counter moved by exactly that file's size. So overlapping deletes refuse each other, and each gives up after 3 attempts. In the worst case about 3 files are removed and the rest become orphans until the sweep.

Add to `src/lib/blobStore.ts`:

```ts
/** Removes several files one at a time. Overlapping deletes refuse each other. Never throws. Returns how many went. */
export async function deleteBlobs(
  institutionId: string,
  keys: readonly string[],
): Promise<number>;
```

The form and `deleteRecord` use `void deleteBlobs(...)` where they looped over `void deleteBlob(...)`, and the timing does not change: the files go only after the Firestore write succeeds. The cleanup after a failed save in `commitWithBlobs` uses it too.

### 4.3 The storage ceiling

Counters add a file's raw size, but the database stores base64.

| Counter limit (raw)             | Actually stored                   |
| ------------------------------- | --------------------------------- |
| 900,000,000 (today)             | about 1.2 GB, over the 1 GB limit |
| 700,000,000 (new)               | about 933 MB                      |
| 200,000,000 (school, unchanged) | about 267 MB                      |

Change `TOTAL_BUDGET_BYTES` and `usage/total/bytes` in `database.rules.json`.

**Check before deploying:** the counter's `.validate` rule also applies to a delete's write, so a total above the new ceiling would block deletes that leave it above. The total was 12,938,119 on 2026-11-03. Run the sweep dry run first, and do not deploy above 700,000,000.

### 4.4 Reading fewer file bodies

When a file is removed in the form, `existingBlobKeys` reads its whole document to find a key, including any inline body. Look up only files whose recorded `size` is over 500 KB or is 0, since older records can read back as 0.

`deleteRecord` keeps listing all of a note's file documents. Deleting a note is rare, and the list also clears stray documents. This can download up to about 8.2 MB for a note with 12 inline files, which is accepted.

### 4.5 The form

**Help text:**

> PDF, Word (.docx), PowerPoint (.pptx), JPEG, PNG, or WEBP — 5MB max each, up to 12 files, 15MB in total.

The per-file figure follows `uploadLimitLabel(policy)`, as it does today.

**Meter,** shown while choosing files:

> 4 of 12 files · 6.2 MB of 15 MB (41% used)

The percentage is `Math.round(usedBytes / MAX_LESSON_NOTE_TOTAL_BYTES * 100)`, based on size because size usually runs out first. It counts kept and newly added files, updates as files are added and removed, and uses the shared progress bar. It appears once a note has a file.

**Choosing files:**

1. For each chosen file, call `validateAddedFile(current, file)` **before** reading it. It needs only `size`, so a file over the limit is never read.
2. A rejected file does not stop the rest, so a smaller later file can still fit.
3. Name what was left out:

> Added 2 files. Not added: a.pdf, b.pdf (a note can have at most 12 files).

One file refused on its own keeps its plain reason, such as "File must be 5MB or smaller."

**Saving:**

- `commitWithBlobs` gains an optional `onProgress(done, total)`. `done` counts finished uploads, and `total` counts only the files going to the Realtime Database.
- `onUploading` stays on for the whole upload stage, which ends the flicker between files.
- The form shows the shared progress bar with:

> Uploading 3 of 9 (33%)

The number shown is files finished, so it starts at "Uploading 0 of 9 (0%)".

**Budget pre-check:**

- Before the first upload, `commitWithBlobs` reads the counters once and calls `checkBudget(usage, totalOfNewLargeFiles)`. A note that would not fit is refused before any upload.
- `putBlob` keeps its own per-file check, since another upload could arrive in between.
- The pre-check does not subtract files removed in the same save, because deletes run afterwards. A note replaced near a full budget may be refused, which is the safe direction. Its message suggests saving the removal first.

**Budget warning:** when a large file is added and the school is at 80% or more, the form shows "Your school's large-file storage is 82% full." It reads the counters at that moment, not during the pre-check, because a successful save closes the form before a warning could be seen. A failed read just shows nothing.

---

## 5. Firestore limits to prove first

Neither can be settled by reading the docs, so step 0.2 tests both against live rules.

| Limit                                       | Worst case                                                                               | Risk                                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1,000 rule expressions per request          | 26 operations in one batch: 12 new files, 12 removed files, the note and the audit entry | **Unknown.** The longest path is a senior teacher editing a regular teacher's note. A failure shows up as a plain "permission denied" |
| 20 access calls per batch, 10 per operation | Three documents: the user, the note and the note after the write                         | Low, since cached calls do not count                                                                                                  |
| 10 MiB request                              | 12 inline files: about 8.2 to 8.4 MB                                                     | Low, with about 2 MB spare                                                                                                            |

**If the expression limit is hit, try these in order:**

1. Reorder the file rule so cheap checks decide first.
2. Delete removed files in a second batch after the save. A leftover file document is harmless, since the note no longer lists it and deleting the note clears it.
3. Lower the limit, for example to 10.

Do not write file documents in a separate batch, since the note could then list a file that does not exist.

---

## 6. Second pull request: the quota gate

### 6.1 Levels

| Level     | At                                             | What happens                                                                 |
| --------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Normal    | Under 6 GB total and under 3 GB for the school | Everything works                                                             |
| Soft stop | 6 GB total, or 3 GB for the school             | "Download all" is off for the rest of the month; per-file downloads continue |
| Hard stop | 8.5 GB total                                   | Large-file downloads stop for everyone; inline files keep working            |

The margin allows for protocol overhead, session-lock traffic, reads the counter misses, and uncertainty over exactly when Firebase's month starts.

### 6.2 Data

```text
/usage/downloads/{yyyy-mm}/total/bytes
/usage/downloads/{yyyy-mm}/institutions/{institutionId}/bytes
```

- `{yyyy-mm}` is the UTC month. A new month starts at zero on its own, and old month nodes are a few bytes each.
- The counters measure bytes on the wire: `Math.ceil(size * 4 / 3) + 100`.
- Every Realtime Database file read counts, including assignments.
- A read served from the local store counts nothing.
- Firestore's inline files are not counted, since they use a separate allowance and are small.

### 6.3 Behaviour

`getBlobDataUrl` gains the file's size, which both callers already hold (`attachments[].size` and `attachmentSize`). When the recorded size is 0, it reads the file's `size` node first.

1. A per-file download reads the total counter once and refuses at the hard stop.
2. "Download all" reads both counters once at the start, and picks the button's state. During a run it adds its own bytes to that figure, rather than reading again.
3. Before each large read, the app raises both counters with `ServerValue.increment`. It raises them first, so a failed read may count slightly high, which is the safe direction.
4. If the counter write fails, "Download all" stops with a clear message. A per-file download goes ahead, since its read would probably fail too.

**Messages:**

- Soft stop: "Download all is off for the rest of this month. You can still download each file."
- Hard stop: "Large files can't be downloaded for the rest of this month. Files under 500 KB still work."

### 6.4 Limits of the gate

- **It counts honest clients.** A modified client can skip the counter, as with the storage counters. The kill switches do bind that client, since the rules check them.
- **A hostile user could raise the counters** and turn "Download all" off for everyone. Rules limit each step, not how many there are. The owner can correct the counter with the Admin SDK.
- **The counter is not the bill.** The console stays the source of truth, and step 8.7 compares the two.

---

## 7. Second pull request: the kill switches

```text
/config/largeFileReadsPaused    <- true or absent
/config/largeFileWritesPaused   <- true or absent
```

Only the Admin SDK can write them. Any signed-in user can read them. Each works without the other.

|                  | Read switch                                              | Write switch                                                            |
| ---------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Stops**        | Reads of `/files/...`, for lesson notes and assignments  | New files in `/files/...`, for lesson notes and assignments             |
| **Leaves alone** | Uploads, inline files, the session lock                  | Deletes, inline files, the sweep, student submissions, the session lock |
| **Message**      | "Large files are paused. Files under 500 KB still work." | "Large file uploads are paused. Files under 500 KB can still be saved." |

**Why deletes stay allowed under the write switch:** people can free space, `commitWithBlobs` can remove uploads after a failed save, and notes can be deleted without leaving orphans.

**Why inline files are not covered:** Firestore rules cannot read this flag. Covering them would need a Firestore config document and a billed rule read on each write.

**Telling a pause from a counter conflict:** `putBlob` treats a refused write as "a counter moved" and retries, ending in a generic "could not be saved". So:

- The upload path reads the write flag once before the first upload, alongside the budget pre-check, and shows the message above.
- The download path reads the read flag when a read is refused, to choose the right message.

**Script:** `scripts/set-large-files-paused.mjs`, following `scripts/README.md`'s conventions:

```bash
node scripts/set-large-files-paused.mjs --key=<path> --project=<id> --reads on
```

```bash
node scripts/set-large-files-paused.mjs --key=<path> --project=<id> --writes off --apply
```

It is a dry run unless `--apply` is given, refuses a project that does not match the key, and prints each flag's state before and after. `--reads` and `--writes` can be used alone or together. Turning a flag off removes the node.

The switches are manual, because Spark has no scheduler and rules cannot compute the month.

---

## 8. Second pull request: the local store

### 8.1 What it is for

It saves Firebase use on repeats, resumes and retries, and makes those near-instant. It cannot help a person's first download, and it cannot reduce Firebase storage, since a local copy serves only one device.

### 8.2 Design

`src/lib/noteFileStore.ts` owns one IndexedDB database, `sms_note_files`.

| Store    | Key                       | Value                                           |
| -------- | ------------------------- | ----------------------------------------------- |
| `files`  | `{uid}/{noteId}/{fileId}` | `{ blob, fileName, size, savedAt, lastUsedAt }` |
| `ledger` | `{uid}/{noteId}`          | `{ clickedAt, downloaded: { [fileId]: true } }` |
| `meta`   | `owner`                   | The signed-in `uid`                             |

- **Staying correct:** file ids are random, and a replaced file gets a new id. A stored copy is used only if its `fileName` and `size` also match the note's metadata, which covers the older `data` id.
- **Stored as** `Blob`s, not base64.
- **Limit:** over `LOCAL_STORE_MAX_BYTES`, the least recently used files go. A quota error drops the file quietly. A save never fails because of the store.
- **No storage available:** the same API falls back to memory, and the block then lasts until a refresh. Every call is wrapped so it never throws.
- **Never through React Query,** whose cache is persisted to `sessionStorage`.

### 8.3 Clearing

- `purgeSession()` closes the connection and deletes the database. Every way of signing out already calls it.
- The reload that follows can interrupt the delete, so opening the store also compares `meta.owner` with the signed-in `uid`, and clears everything on a mismatch.
- A browser closed without signing out keeps the copies until the next sign-in, as it keeps the session.

### 8.4 Eviction

Browsers may delete this data under storage pressure, and WebKit's policy caps script-writable storage at 7 days without visits outside installed home-screen apps. Losing it just means fetching again. The ledger's absence means the button returns to "Download all", which the counter still limits.

### 8.5 Limits of the repeat block

It is per device, and clearing browser data resets it. It prevents honest repeats and is not a security control. The counter protects the allowance.

---

## 9. Second pull request: Download all

### 9.1 Button states

Per note, per person, until sign-out. `remaining` is the note's current files not yet marked downloaded in the ledger.

| Situation                                                      | The person sees                                                           | Firebase use                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------- |
| 2+ files, none downloaded                                      | **Download all**                                                          | Up to the whole note          |
| Some files downloaded, by a stopped run or one by one          | **Download remaining (3)**                                                | Only those not stored locally |
| A run is going                                                 | Progress, notice and controls                                             | The current file              |
| Files skipped by a failure                                     | **Retry skipped (2)**                                                     | Only those files              |
| Every file downloaded, all with local copies                   | **All files downloaded** (disabled), plus **Save again from this device** | **None**                      |
| Every file downloaded, some copies gone                        | **All files downloaded** (disabled); each file's own button still works   | One file per click            |
| Soft stop, hard stop or read switch, with files still to fetch | Off, with the reason. "Save again" still works                            | None                          |
| A teacher adds a file later                                    | **Download remaining (1)**                                                | Only that file                |
| Under 2 files                                                  | No button                                                                 | None                          |

A removed file drops out of `remaining`, so a note can become complete without another download.

**When a file counts as downloaded:** when it is handed to the browser. In a zip, that is when the zip is saved. A file fetched but discarded is kept locally and is still remaining, so fetching it again uses no Firebase.

### 9.2 Shared behaviour

- The button sits at the top of the Files section, with the progress bar and notice.
- It always confirms first, with the count and size of what will be fetched: "Download 12 files (14.8 MB)?"
- Phones and tablets add: "Your browser may ask you to allow several downloads. If a file does not save, use its own Download button."
- Files are fetched one at a time. The store is checked first.
- File keys are remembered in memory for the run, so a retry can skip the Firestore read.
- A network failure gets one automatic retry. A file that no longer exists is not retried. Either way it is named at the end.
- Each file's own Download button stays. It is disabled during a fetch, and usable while paused or finished. It checks the store first and marks the ledger.
- The view dialog shows "12 files, 14.8 MB".

### 9.3 During a run

- **Notice:** "Keep this window open until all files are downloaded. Closing it stops the download."
- **Outside taps:** ignored, and the dialog stays open.
- **The X:** acts as Stop. During a zip it opens the save-or-discard question.
- **Leaving the page:** shows the browser's "leave site?" warning, as `navigationGuardWatch.ts` does. A later visit offers "Download remaining".
- **Inactivity:** `useKeepAliveWhileOpen` runs for the length of the run, with a cap long enough for a slow connection, so a wait with no taps does not sign the person out.
- **If the dialog closes anyway,** the run stops. The new hook sits above the dialog's early `return null`.

**What Stop can and cannot do:** files not yet started are stopped. A file already with the browser keeps saving. A Firebase read under way cannot be cancelled, so its result goes into the store and is not wasted.

### 9.4 Desktop: zip

Used when `(pointer: coarse)` does not match.

1. Fetch each file, showing "Fetching 3 of 12" and the bar.
2. Build the zip with `zipSync` from a lazy-loaded `fflate`, using `level: 0`, since these formats are already compressed.
3. Save it as `<note name>.zip`.
4. Report any files left out.

- **Stop** asks: "Save the 5 files fetched so far, or discard?" Discard skips the zip but keeps the local copies.
- If every file fails, no zip is saved and the dialog says so.
- **Names:** remove path characters such as `/` and `\`, and rename duplicates (`notes.pdf`, `notes (2).pdf`). The same applies to the zip's name.
- "Download remaining" zips the remaining files. "Save again" zips all of them.

Peak memory is about 50 MB at the 15 MB total.

### 9.5 Phones and tablets: sequential

Used when `(pointer: coarse)` matches. It is checked when the dialog opens. A tablet may show the desktop layout with this button, which is intended.

```text
confirming -> running -> (fetch, store, save, wait about 1.5 s, next file) -> done
                 |  ^
             Pause  Resume automatic
                 v  |
               paused -- Download next (4 of 12) --> save one file, stay paused
                 |
             Stop (from running or paused) -> done, offering "Download remaining"
```

- Pause lets the current file finish. Stop prevents the next one from starting.
- A web page cannot tell when a save has finished or was blocked. "Finished" here means fetched and handed to the browser.
- Browsers may block repeated scripted saves. "Download next" is a fresh tap, which is the fallback for that. "Save again" recovers a blocked save at no Firebase cost.
- The text reads "Saving 3 of 12: name.pdf".

### 9.6 Progress component

`src/components/DownloadProgress.tsx`, also used by the form's upload progress:

- A native `<progress value={processed} max={total}>`, where failed files count as processed.
- Styled with `accent-color`, `::-webkit-progress-bar`, `::-webkit-progress-value` and `::-moz-progress-bar`, using `--brand-button-bg`, with dark mode support.
- An `aria-label`, with the text beside it in `aria-live="polite"`.
- It moves per file, because a single Firebase read reports no byte-level progress.

### 9.7 Files

| File                                    | Holds                                                           |
| --------------------------------------- | --------------------------------------------------------------- |
| `src/lib/lessonNoteAttachment.ts`       | `fetchLessonNoteFile` split from `downloadLessonNoteAttachment` |
| `src/lib/downloadFile.ts`               | `saveBlob` beside `saveDataUrl`                                 |
| `src/lib/lessonNoteBulkDownload.ts`     | Pure state machine, button states, file naming                  |
| `src/lib/lessonNoteZip.ts`              | The only zip code, lazy-loaded                                  |
| `src/lib/noteFileStore.ts`              | The store and ledger                                            |
| `src/lib/downloadGate.ts`               | Pure thresholds and the month key                               |
| `src/hooks/useLessonNoteDownloadAll.ts` | The run itself                                                  |
| `src/components/DownloadProgress.tsx`   | The bar and text                                                |
| `scripts/set-large-files-paused.mjs`    | The kill switches                                               |

---

## 10. Third pull request: student file reads

### 10.1 What changes

`ISSUES_AND_GAPS.md` #66 records that a student can read any lesson note that has a class, because a rule cannot be proven for a query on a list. That limit applies to **queries**. A rule can inspect a list when reading **one document by id**, and that is how files are fetched.

| Part of #66                                                                  | After this work                               |
| ---------------------------------------------------------------------------- | --------------------------------------------- |
| A student reading another class's file                                       | **Closed**                                    |
| A student learning another class's file key                                  | **Closed,** since the key is in that document |
| A student reading another class's note name and details with their own query | Open; needs a per-class copy of each note     |
| A parent reading other classes' files and assignments                        | Open (section 10.3)                           |

### 10.2 Rule

```text
function myClassList() {
  return me().get('classIds', 'classId' in me() ? [me().classId] : []);
}
function noteClassList(n) {
  return n.get('classIds', 'classId' in n && n.classId != null ? [n.classId] : []);
}
function lessonNoteFileReadableBy(n) {
  return canReadAdminData()
    || n.teacherId == request.auth.uid
    || seniorTeacherMayActOnLessonNoteData(n)
    || (myRole() == 'student' && noteClassList(n).hasAny(myClassList()))
    || (isParent() && lessonNoteHasClass(n));
}

match /institutions/{institutionId}/lessonNotes/{lessonNoteId}/attachment/{docId} {
  allow get:  if isSignedIn() && inMyInstitution(institutionId)
    && lessonNoteFileReadableBy(lessonNoteData(institutionId, lessonNoteId));
  allow list: if isSignedIn() && inMyInstitution(institutionId)
    && lessonNoteWritableBy(lessonNoteData(institutionId, lessonNoteId));
  // create, update and delete are unchanged
}
```

- **Cost:** no extra billed reads. It uses the same user and note documents as today.
- **`list` narrows** because the app's only list of file documents is `noteFileDocs`, used when deleting a note. Without this, a student could fetch other classes' files by listing.
- **Trust:** `ownerMayEditOwnProfile()` is an allow-list that excludes `classId` and `classIds`, so a student cannot add classes to themselves.
- **Subjects are not checked.** A student in the class who does not take the subject can still read the file. The page hides it, as it does today.

This is the design to prove, not final rule text. Steps 0.6 and 7.2 test it.

### 10.3 Parents, later

A rule needs the parent's children's classes, but `student_parents` documents are keyed by parent and student, and a file does not name a student. The recommended later approach is `linkedClassIds` on the parent's user document, kept up to date when links or a child's classes change, and backfilled once.

---

## 11. Roles

| Role              | Attach files                                                                          | Per-file download                                                             | Download all                             |
| ----------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| Institution admin | Any note in the institution; 12 files; 5 MB each                                      | Yes                                                                           | Yes                                      |
| Senior teacher    | Own notes and same-department regular teachers' notes; 12 files; 5 MB each            | The same notes                                                                | Yes                                      |
| Regular teacher   | Own notes; 12 files; 5 MB each                                                        | Own notes                                                                     | Yes                                      |
| Student           | No                                                                                    | Notes for their classes and subjects; rules limit file reads to their classes | Yes                                      |
| Parent            | No                                                                                    | Notes for their linked children; rules stay broad for now                     | Yes                                      |
| Spectator         | No                                                                                    | As an admin sees them                                                         | Yes; it writes only the download counter |
| Super admin       | Allowed by the rules, hidden in the app: no institution is selected, so no notes load | Not reachable in the app                                                      | Not reachable in the app                 |

The repeat block and quota gate apply equally to every role.

---

## 12. Known limits and the backend design

| Limit                                                                                           | Status                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The 15 MB total is checked in the client only                                                   | Accepted. A direct write's maximum per note rises from 25 MB to 60 MB raw. Counters still apply to honest clients                                                                                                     |
| The 5 MB limit by role is enforced by the app only                                              | Closes with claims, below. Until then a student can write a file only into the Realtime Database, without any note pointing to it, and the sweep removes it after 7 days. The cost is wasted budget, not exposed data |
| Anyone signed in with a file's key can read it                                                  | Reduced by section 10 and the delete fix. Closes with claims and backend downloads. Encrypting in the browser would not help, since the decryption key would sit in the same document                                 |
| A deactivated account that kept a key can still read that file                                  | The rules only check `auth != null`. Disabling the Auth account needs the Admin SDK, so a script or the backend                                                                                                       |
| Any signed-in user can write counters and files under another school (`ISSUES_AND_GAPS.md` #65) | Closes with claims                                                                                                                                                                                                    |

### Custom claims, for the backend

Realtime Database rules can read `auth.token`, but only the Admin SDK can set claims, and Spark has no Cloud Functions. Accounts are created in the browser today, so a script would have to run after every new account. So this waits for the backend.

```text
/files/$institutionId/$blobKey
  .read:  auth != null && auth.token.institutionId === $institutionId && <not paused>
  .write: auth != null && auth.token.institutionId === $institutionId
          && auth.token.largeUploads === true && <today's checks>

/usage/institutions/$institutionId/bytes
  .write: auth != null && auth.token.institutionId === $institutionId
```

- Claims are `{ role, institutionId, largeUploads }`, set at account creation and on role changes.
- A migration step sets claims for all existing accounts before the rules change.
- A role change takes up to an hour to reach a signed-in person, unless their token is refreshed.

---

## 13. Future: SQLite

Not in this work. IndexedDB holds whole files with no new dependency. SQLite, through WebAssembly and the browser's private file system, is strongest at searching structured records. It adds about 130 to 180 KB gzipped of JavaScript plus a `.wasm` file, needs a Web Worker, may need cross-origin isolation headers, has the same Safari eviction concerns, and must be cleared at sign-out.

| Possible use                | How it would help                                                                              | When it makes sense                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Offline note catalogue      | A searchable copy of note details. Could reduce repeat list reads                              | With the backend, or if list reads become a problem. Needs a privacy decision, since the Firestore cache is memory-only on purpose |
| Download ledger and reports | "What is new since my last visit"                                                              | If students ask for it                                                                                                             |
| Deduplicate across notes    | The same worksheet on two notes is fetched once on this device. Does not reduce server storage | When the same files are often attached to several notes                                                                            |
| Whole-file storage          | None beyond IndexedDB                                                                          | Not advised; recorded so it is not re-proposed                                                                                     |

---

## 14. Free tier

Worst cases, with rule reads at the estimate of 2 to 3 per file.

| Action                                | Today (5 files)     | With 12 files                                           |
| ------------------------------------- | ------------------- | ------------------------------------------------------- |
| Create a note                         | 7 writes            | 14 writes                                               |
| Replace every file                    | 7 writes, 5 deletes | 14 writes, 12 deletes                                   |
| Delete a note                         | 5 reads, 6 deletes  | 12 reads, 13 deletes                                    |
| Reads to download all, one person     | about 20            | about 48 first time; 0 when repeated on the same device |
| Reads to download all, class of 30    | about 600           | about 1,440, or about 2.9% of the daily 50,000          |
| Firestore stored per note, all inline | about 3.4 MB        | about 8.2 MB                                            |
| Realtime Database stored per note     | about 21 MB         | about 21 MB                                             |
| Realtime Database per full download   | about 21 MB         | about 21 MB; 0 when repeated on the same device         |
| Download counter                      | none                | 1 tiny write per large file, plus tiny counter reads    |

**No new collections or indexes.** New Realtime Database paths hold only numbers and flags.

**The download budget:** about 476 full downloads of a maximum note use the whole month across all schools, and about 285 reach the soft stop. Real notes are far smaller: the average so far is under 2 MB in the Realtime Database. A small school whose students all fetched every new note each month would use well under the 3 GB school share, even if use grows 2.4×.

**The school budget:** the one school using the feature has used under 10% in its first month. That lasts about a year at that rate, about 5 months if use grows 2.4×, and about 3 at 12 notes a month averaging 5 MB in the Realtime Database.

---

## 15. Implementation order

Steps are numbered by phase, and the gaps between pull requests are intended. Each deploy waits for the owner's approval (D22).

### First pull request

| Step | Work                                                                                                                                                                                         | Done when                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 0.0  | This spec                                                                                                                                                                                    | Owner has reviewed it                                                          |
| 0.1  | Deploy `<= 12` to Firestore (only widens the rule)                                                                                                                                           | Live app still works                                                           |
| 0.2  | On the QA institution, real batches of 12 files: regular teacher create; senior teacher replacing all 12 on a regular teacher's note; admin; 12 maximum inline files. Delete them afterwards | All allowed. If not, apply section 5                                           |
| 0.3  | Sweep dry run; read the counters                                                                                                                                                             | Total under 700,000,000                                                        |
| 1.1  | `MAX_LESSON_NOTE_FILES = 12`                                                                                                                                                                 | Form accepts 12 and refuses a 13th                                             |
| 1.2  | Update the rule's comment                                                                                                                                                                    | Comment matches                                                                |
| 1.3  | Update `lessonNoteFiles.test.ts` and `largeAttachmentRules.test.ts`                                                                                                                          | Tests pass                                                                     |
| 2.1  | Add `deleteBlobs`                                                                                                                                                                            | Helper exists                                                                  |
| 2.2  | Use it in `LessonNoteForm.tsx` and `deleteRecord.ts`                                                                                                                                         | No parallel deletes remain                                                     |
| 2.3  | Lower the total ceiling in code and rules, and deploy                                                                                                                                        | Both match; pinning test passes                                                |
| 2.4  | Size filter for key lookups in the form (section 4.4)                                                                                                                                        | Removing inline files reads no bodies                                          |
| 2.5  | Tests: 12 deletes in a row with correct counters; update `blobStore`, `blobStoreLogic`, `databaseRules`, `lessonNoteLargeFiles`                                                              | Tests pass                                                                     |
| 2.6  | Delete a real note with several large files, then sweep dry run                                                                                                                              | No orphans. Also closes the "never exercised" item in `ISSUES_AND_GAPS.md` #46 |
| 3.1  | Help text                                                                                                                                                                                    | Text shows; e2e pins updated                                                   |
| 3.2  | Meter and percentage                                                                                                                                                                         | Correct at 0, part-way and full                                                |
| 3.3  | Check count and total before reading a file                                                                                                                                                  | A 13th file is never read                                                      |
| 3.4  | Keep going after a rejection, and name what was left out                                                                                                                                     | Choosing 15 adds 12 and names 3                                                |
| 3.5  | `onProgress`, the shared bar, no flicker                                                                                                                                                     | "Uploading 3 of 9 (33%)" shows correctly                                       |
| 3.6  | Budget pre-check                                                                                                                                                                             | A note near its budget is refused with no upload                               |
| 3.7  | Replace-near-budget message and comment                                                                                                                                                      | Case tested                                                                    |
| 3.8  | Warning at 80%                                                                                                                                                                               | Appears at 80%                                                                 |
| 3.9  | Unit tests for steps 3.2 to 3.7                                                                                                                                                              | Tests pass                                                                     |
| 8.x  | Release steps below                                                                                                                                                                          | Merged                                                                         |

The progress bar is built in step 3.5, since the form needs it first.

### Second pull request

| Step | Work                                                                                                                        | Done when                                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 0.4  | Prototype sequential saves on real devices: iPhone Safari, iPad Safari, Android Chrome. **The owner runs this**             | Files save, or prompts are understood; the gap is tuned                                      |
| 0.5  | Live test of the counter rule: increment allowed, decrease refused, oversized step refused, two at once both counted        | All as designed. If increment fails under the rule, use a transaction                        |
| 4.1  | Rules for counters and both switches; deploy                                                                                | Rule tests pass                                                                              |
| 4.2  | `downloadGate.ts`                                                                                                           | Boundaries tested                                                                            |
| 4.3  | Raise counters before every large read                                                                                      | Each counts once; local copies count zero                                                    |
| 4.4  | Read switch in the script                                                                                                   | Blocks a real read and clears again                                                          |
| 4.5  | Write switch in the script                                                                                                  | A new large upload is refused; a delete, an inline file and a failed-save cleanup still work |
| 4.6  | Gate messages                                                                                                               | Each state tested                                                                            |
| 4.7  | Read the write flag before uploading                                                                                        | No retries against the rule                                                                  |
| 4.8  | Tests, including both switches alone and together                                                                           | Tests pass                                                                                   |
| 5.1  | Store with memory fallback                                                                                                  | Works with storage blocked                                                                   |
| 5.2  | Size limit and oldest-first removal                                                                                         | A save never fails because of this                                                           |
| 5.3  | Ledger                                                                                                                      | Survives a refresh; matches the note's current files                                         |
| 5.4  | Clear at sign-out and on a different user                                                                                   | A second person on a shared computer sees nothing                                            |
| 5.5  | Per-file downloads use the store                                                                                            | A repeat makes no Firebase call                                                              |
| 5.6  | Tests                                                                                                                       | Tests pass                                                                                   |
| 6.1  | Split the fetch; remember keys for the run                                                                                  | Per-file downloads behave as before                                                          |
| 6.2  | State machine and button states                                                                                             | All states tested                                                                            |
| 6.3  | Zip module                                                                                                                  | Holds the right bytes; `examImportBundle.test.ts` updated                                    |
| 6.4  | Reuse the bar in the dialog                                                                                                 | Checked in both themes and with a screen reader                                              |
| 6.5  | Notice, ignored taps, X as Stop, tab-close warning                                                                          | Each behaviour tested                                                                        |
| 6.6  | Retry and missing-file handling                                                                                             | Only skipped files are fetched again                                                         |
| 6.7  | Keep-alive during a run                                                                                                     | A long run does not sign the person out                                                      |
| 6.8  | Unit tests and one new e2e spec                                                                                             | Tests pass                                                                                   |
| 6.9  | Repeat step 0.4 with a real student account, including Pause, Stop, a failed file and "Save again". **The owner runs this** | All work                                                                                     |
| 8.x  | Release steps below                                                                                                         | Merged                                                                                       |

### Third pull request

| Step | Work                                                                                                                                                       | Done when                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 0.6  | Emulator cases: own class allowed, other class denied, `classId`-only notes, additional classes, a student with only `classId`, every other role unchanged | All correct                                                                     |
| 7.1  | Split the file rule                                                                                                                                        | Students read only their classes' files; `noteFileDocs` still works for writers |
| 7.2  | Update `e2e/09-lesson-notes.spec.ts`, add rule tests to `npm run test:rules`, then try real student accounts before deploying                              | All pass                                                                        |
| 7.3  | Record the parent step and claims design in `ISSUES_AND_GAPS.md` #65 and #66                                                                               | Both updated                                                                    |
| 8.x  | Release steps below                                                                                                                                        | Merged                                                                          |

### Release steps, for each pull request

| Step | Work                                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------------------- |
| 8.1  | Update in-code comments                                                                                         |
| 8.2  | Update documents, including the 360 MB/day correction in the first pull request                                 |
| 8.3  | Run `npm test`, `npm run lint` and `npm run build`. Add `npm run test:rules` when Firestore rules changed       |
| 8.4  | Run only the e2e specs named below, since they use production quota                                             |
| 8.5  | Ask the owner about the version: suggested minor, minor, patch. Confirm the next SMS number with `gh`           |
| 8.6  | Changelog bullets and deploy notes                                                                              |
| 8.7  | After release: sweep dry run; for the second pull request, compare the counter with the console for a few weeks |

---

## 16. Tests

| File                               | Change                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lessonNoteFiles.test.ts`          | `toBe(12)`, and a thirteenth file refused                                                                                                                      |
| `largeAttachmentRules.test.ts`     | `<= 12`                                                                                                                                                        |
| `lessonNoteMultiFile.test.ts`      | Form text pins                                                                                                                                                 |
| `lessonNoteLargeFiles.test.ts`     | The new delete call; it looks for the exact string `void deleteBlob(...)` today                                                                                |
| `blobStore.test.ts`                | `deleteBlobs`, pre-check, counters, paused upload with no retry, ceiling fixture                                                                               |
| `blobStoreLogic.test.ts`           | Follows the constant; a check that stored bytes stay under 1 GB                                                                                                |
| `databaseRules.test.ts`            | `config` allowed, 700 MB, counters only increase, listing still impossible, both switches writable by nobody, write switch checked on create and not on delete |
| `examImportBundle.test.ts`         | Add the zip module to the `fflate` list                                                                                                                        |
| `sessionPurge` tests               | The store is cleared                                                                                                                                           |
| `spectatorRules.test.ts`           | The new file rule passes the spectator lint                                                                                                                    |
| `e2e/09-lesson-notes.spec.ts`      | Help text; 13 denied instead of 6; a 12-file batch; a student in another class now denied (third pull request)                                                 |
| `e2e/17-large-attachments.spec.ts` | Help text                                                                                                                                                      |
| New unit tests                     | State machine, button states, zip, gate, store, progress                                                                                                       |
| New e2e spec, next free number     | Desktop zip, `isMobile`/`hasTouch` sequential, repeat block                                                                                                    |

Playwright cannot stand in for real phones, which is why steps 0.4 and 6.9 exist.

---

## 17. Documentation to update

**In code:** every "up to five" or "at most 5" (`lessonNoteFile.ts`, `blobStore.ts`, `deleteRecord.ts`, `sweepOrphanBlobsLogic.mjs`, `firestore.rules`); the stale `attachment/data` comments in `lessonNoteFile.ts` and `types/lessonNotes.ts`; why the ceiling is 700,000,000 in `blobStoreLogic.ts`; the store in the list at the top of `sessionPurge.ts`; the counter in the rules at the top of `blobStore.ts`.

**Markdown:**

| File                                                      | Update                                                                                                                              |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `docs/guides/USER_GUIDE.md`                               | 12 files and the total; Download all, the notice, Pause/Stop, "Save again", the monthly limit message                               |
| `README.md`                                               | "up to five files"                                                                                                                  |
| `scripts/README.md`                                       | The kill-switch script and its two flags                                                                                            |
| `docs/miscellaneous-specs/LESSON_NOTES_RELEASE_NOTES.md`  | New addendum                                                                                                                        |
| `docs/miscellaneous-specs/LESSON_NOTES_FEATURE_SPEC.md`   | A pointer to this spec from section 11                                                                                              |
| `docs/miscellaneous-specs/LARGE_ATTACHMENTS_RTDB_SPEC.md` | File limit, new ceiling, raw vs stored bytes, and the 360 MB/day correction                                                         |
| `docs/firebase/firebase-rules.md`                         | The limit, ceiling, counters, switches and student file check                                                                       |
| `docs/ISSUES_AND_GAPS.md`                                 | #46: ceiling, 360 MB/day correction, delete fix, gate and store. #65: ceiling and claims design. #66: what changed and what is open |
| `docs/project-overview/ROLE_PRIVILEGE_ANALYSIS.md`        | The student file read                                                                                                               |
| `docs/compliance/LEGAL_AND_PRIVACY_COMPLIANCE.md`         | Teaching files are cached on the device until sign-out; the narrower student read                                                   |
| `CHANGELOG.md`                                            | Bullets and deploy notes                                                                                                            |

---

## 18. Deploy and rollback

Commands run from `sms-system/`. `firebase deploy --only database --project school-sms-v1` covers the Realtime Database, and `npm run firebase:deploy:rules` covers Firestore.

| Pull request | Before the merge                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First        | Sweep dry run; stop if the total is above 700,000,000. Deploy Firestore `<= 12`, which is safe since the running app still stops at 5. Deploy the lower ceiling |
| Second       | Deploy the counters and both switches, which is safe since the running app does not use them and both flags start absent                                        |
| Third        | Check the student rule with real student accounts, since it changes behaviour immediately. Then deploy                                                          |

**Rollback:**

- Revert the app, but **keep the Firestore file limit at 12**. `isValidLessonNote` runs on every update, so going back to 5 would stop any note with more files from being edited.
- Keep the lower ceiling and counters. They only make uploads refuse earlier and record numbers.
- If the student file rule causes a problem, restore that one clause on its own.
- If a kill switch is on, turn it off with the script.

---

## 19. Sources and open items

**Sources, checked 2026-11-03:** [Firebase pricing](https://firebase.google.com/pricing), [Firebase FAQ](https://firebase.google.com/support/faq), [Firestore quotas](https://firebase.google.com/docs/firestore/quotas), [Realtime Database limits](https://firebase.google.com/docs/database/usage/limits), [Realtime Database billing](https://firebase.google.com/docs/database/usage/billing), [Security Rules and Authentication](https://firebase.google.com/docs/rules/rules-and-auth), [MDN storage quotas and eviction](https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

**Not yet proven:**

- The rule limits at 12 files (step 0.2).
- `ServerValue.increment` under the counter rule (step 0.5).
- Saving several files on real phones and tablets, and iOS Safari especially (steps 0.4 and 6.9).
- The student file rule (steps 0.6 and 7.2).

**Open:**

- How the Spark shut-off applies to each product, and when service returns. The FAQ does not say.
- When to schedule the parent file reads (section 10.3).
- Whether to disable Auth for deactivated accounts as its own task (section 12).
- Whether 3 GB per school should shrink as more schools become active.
