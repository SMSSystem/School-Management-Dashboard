# Assignments Retention — Deploy & QA Runbook

> Companion to `ASSIGNMENTS_FEATURE_SPEC.md` §9 / §12, for Implementation
> Order step 7 (TTL policies + `scripts/trim-old-submission-attachments.mjs`).
> Follow this project's standing rule: **never against a real institution
> first.**
>
> **Update (2026-09-29): TTL will not be enabled.** Per an explicit
> operator decision, §1.2 and §4 below are no longer going to happen —
> left in place as a record of the original design, not as pending work.
> Only §1.1 (index) and §3 (trim script) are still live/actionable. See
> `ASSIGNMENTS_FEATURE_SPEC.md` §9.1/§8 for the consequence: storage
> growth from this feature is reduced by the trim script, not bounded,
> since nothing now deletes the metadata-only documents it leaves behind.

---

## 1. One-time setup (run once, in order)

### 1.1 Deploy the new composite index

The trim script's `collectionGroup('attempts').where('deleteAt', '<=', ...)`
query needs the new `attempts` collection-group index (`firestore.indexes.json`)
live before the script can run at all:

```
firebase deploy --only firestore:indexes
```

### 1.2 Enable the two TTL policies — **not happening (decision, 2026-09-29)**

**Skip this section.** Per an explicit operator decision, these commands
will not be run. Kept below as a record of what the original design
required, in case this decision is ever revisited — not as a pending step.

Not part of `firebase deploy` — this is a separate Firestore API, and each
policy is a one-time, project-wide setting (applies to every institution's
`submissions`/`attempts` from this point forward, not just a QA one):

```
gcloud firestore fields ttls update deleteAt --collection-group=submissions --enable-ttl
gcloud firestore fields ttls update deleteAt --collection-group=attempts --enable-ttl
```

Confirm both took effect:

```
gcloud firestore fields ttls describe deleteAt --collection-group=submissions
gcloud firestore fields ttls describe deleteAt --collection-group=attempts
```

(Or: Firebase Console → Firestore Database → TTL policies tab.) Both
collection groups are currently empty project-wide, so this step carries no
data-loss risk today — but it's still live, and from this point on any real
submission created anywhere will be subject to it.

---

## 2. Disposable QA institution setup

Use a throwaway institution — either one already set aside for QA, or a new
one via Super Admin → Onboard Institution (a handful of students/one teacher
is enough; `scripts/seed-bulk-institution.mjs` is built for load-testing at
pilot scale and is overkill here).

1. As `regular_teacher`, create an assignment with a **backdated `dueDate`**
   (e.g. 7 months ago) so its computed `deleteAt` (`dueDate + 182d`) has
   already passed — its retention window should be immediately eligible for
   both the TTL policy and the trim script's cutoff.
2. As `student`, submit work against it (`list/assignments/[id]`'s upload
   control). Resubmit once, so there are two `attempts` documents to observe.
3. Note the assignment/submission paths for the checks below.

---

## 3. Trim script — dry-run, then live, then idempotency

```
node scripts/trim-old-submission-attachments.mjs --dry-run
```

Confirm the QA submission's `attempts` documents (and the parent
`submissions` doc, since it duplicates the current attempt's file) are
listed as "would trim." Then:

```
node scripts/trim-old-submission-attachments.mjs
```

In the Firestore console, confirm on both the `attempts` doc(s) and the
parent `submissions` doc:
- `fileDataUrl`/`mimeType` — **gone**.
- `fileName`/`fileSize`/`submittedAt`/`attemptNumber` (attempts) or
  `currentAttemptNumber`/`status` (submissions) — **still present**.

Re-run the same live command a second time — it should report 0 newly
trimmed (idempotency: a document missing `fileDataUrl` is skipped).

---

## 4. TTL deletion — **not applicable (decision, 2026-09-29)**

**Skip this section** — nothing in §1.2 was ever enabled, so there is no
TTL sweep to observe. `submissions`/`attempts` documents (metadata-only,
after §3's trim) are never deleted; only `submissionTombstones` was ever
designed to persist indefinitely, and now everything below it does too.
Kept as a record of what would have been verified had TTL shipped.

Firestore's TTL sweep isn't instant — allow up to ~24 hours after `deleteAt`
passes (already true for this backdated QA data) before checking. Once it's
run:

- The QA submission's `submissions/{studentId}` doc and every
  `attempts/{n}` doc — **gone**.
- `submissionTombstones/{studentId}` — **still present**, with
  `firstSubmittedAt`/`lastSubmittedAt`/`attemptCount` intact. This is the
  one document deliberately exempt from both TTL policies (§9.4) — confirm
  it's the only thing left once the rest is deleted.
- The `results` doc, if the QA submission was graded — **still present and
  unaffected** (§9.1: grades are a separate collection, never touched by
  either the TTL policies or the trim script).

---

## 5. Teardown

Delete the disposable QA institution (or its assignments/submissions) once
verification is done, same as every other QA pass in this project.
