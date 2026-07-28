# Cutover Runbook

Execution checklist for `docs/overhaul/FIRESTORE_INSTITUTION_NESTING_SPEC.md` §10.4's
cutover. Every command below is meant to be run by you, locally, in your own
terminal — this environment has no Firebase Admin SDK / service-account access and
cannot run `firebase login`, `firebase deploy`, or the migration scripts.

Check items off as you go. Phase A has no fixed timeline and no maintenance-window
requirement — do it whenever convenient, ideally days before Phase B. Phase B is the
actual cutover and should happen in one sitting. Phase C has no fixed timeline either.

---

## Phase A — Pre-cutover prep (do anytime, no maintenance window needed)

These are all independently safe: additive rules/indexes can't break `main`'s current
(unmigrated) behavior, and the backfill script only writes a field, never deletes
anything.

- [x] **A1. Re-confirm pilot scale hasn't grown.** Before committing to a single
      combined copy pass, re-check institution count and rough document volume in the
      Firebase Console. The plan assumes 1–2 institutions with light data (§14.7). If
      that's grown materially, come back and split cutover step 2 (below) across two
      calendar days by institution instead of running it all at once.

- [x] **A2. Run the department-ID backfill.** Safe to run now — it only reads the
      still-live `teachers` mirror and writes `users/{uid}.departmentId`, no dependency
      on anything else in this cutover.

  ```bash
  node scripts/backfill-department-ids.mjs --dry-run --key=scripts/service-account.json
  ```

  Review the dry-run output, then run for real:

  ```bash
  node scripts/backfill-department-ids.mjs --key=scripts/service-account.json
  ```

- [x] **A3. Verify no destructive change has leaked into `firestore.rules`.**
      Run this before every deploy from here on, not just this once:

  ```bash
  git diff 6df4d98~1 -- firestore.rules | grep '^-' | grep -v '^---'
  ```

  Must return nothing. If it prints anything, stop — something destructive is sitting
  in the working file and needs to move to §10.9 before you deploy.

- [x] **A4. Deploy steps 8–10's rules (the attendance group, report-card group, and
      collectionGroup rules — currently written but not yet live).** This has to
      happen *before* the merge, not during it — once `main`'s new app code goes live
      it will immediately query these nested paths, and if the rules aren't deployed
      yet every one of those reads/writes will fail with permission-denied.

  ```bash
  npm run firebase:deploy:rules
  ```

  Confirm the CLI reports a clean compile/release with no unused-function warnings.

- [x] **A5. Deploy the new composite indexes** (`generalAttendance`/`subjectAttendance`
      nested-path versions, added ahead of this runbook).

  ```bash
  npm run firebase:deploy:indexes
  ```

  Indexes build in the background after deploy — for pilot-scale data this should
  finish in well under an hour, but there's no harm in doing this a day ahead of Phase
  B to be safe.

- [x] **A6. Full branch sanity check**, since this is the last checkpoint before
      merging ~13 commits' worth of work into `main`:

  ```bash
  npx tsc -b
  npx eslint .
  npm run build
  ```

  All three should be clean against the known baseline (the same handful of
  pre-existing warnings this whole session has been checking against — nothing in
  files this overhaul touched).

---

## Phase B — The cutover (one sitting, needs the maintenance window)

- [ ] **B1. Notify pilot institution admins** and open the maintenance window. Covers
      every remaining flat collection at once (§10.4) — plan for it to stay open
      through B7, not just the copy step.

- [ ] **B2. Run the migration script in copy mode**, every phase not yet migrated
      (phase `legacy` already ran — §11 step 3 — skip it):

  ```bash
  node scripts/migrate-to-institutions.mjs --phase=all --dry-run --key=scripts/service-account.json
  ```

  Review the dry-run counts per collection, then run for real:

  ```bash
  node scripts/migrate-to-institutions.mjs --phase=all --key=scripts/service-account.json
  ```

  Nothing is deleted in this step — flat originals are untouched.

- [ ] **B3. Spot-check.** Pick a handful of documents per collection in the Firebase
      Console (`institutions/{id}/{collection}/{docId}`) and confirm they match their
      flat originals — same fields, same document ID, correct institution subtree.
      Pay particular attention to `gradebooks/{id}/columns` (the one subcollection
      case) and any collection where a document had no `institutionId` field (the
      script skips and logs those — confirm the skip count matches what you expect,
      e.g. known placeholder/test docs).

- [ ] **B4. Merge `data-structure-overhaul` into `main`.**

  ```bash
  git checkout main
  git pull
  git merge data-structure-overhaul
  git push
  ```

  This starts Vercel's build — it does **not** mean the new code is live yet.

- [ ] **B5. Confirm the Vercel deploy of merged `main` is actually live** before
      proceeding — check the Vercel dashboard for a completed deployment on the new
      commit, or visit the live app and confirm behavior consistent with the new code
      (e.g. a page that only exists/works post-migration). **Do not skip this check or
      treat the merge itself as sufficient** — this is the exact gap that caused both
      incidents documented in §10.8.

  Once confirmed live, apply §10.9's two pending diffs to `firestore.rules` (the
  `teachers`/`students` retirement and the `subjects` `get()` repointing — exact diffs
  are in the spec) and re-run the safety check before deploying:

  ```bash
  git diff 6df4d98~1 -- firestore.rules | grep '^-' | grep -v '^---'
  ```

  This time it's *expected* to show the two diffs you just applied — confirm the
  output only contains those specific lines, nothing else. Then:

  ```bash
  npm run firebase:deploy:rules
  ```

- [ ] **B6. Smoke-test the golden path per role**, now against real nested data:
  - `super_admin` — cross-institution list view still loads.
  - `institution_admin` — create/edit one record in a newly-nested collection (e.g. a
    subject or a house).
  - `senior_teacher` — department-scoped permission check (e.g. edit a result/feedback
    comment in their department) — this is the one most likely to regress, since it's
    exactly what both prior incidents broke.
  - `regular_teacher` — create a result or feedback comment for one of their subjects.
  - `student` — view their own attendance/results/report card.
  - `parent` — view a linked child's attendance/results/report card.

- [ ] **B7. Close the maintenance window** once B6 passes.

---

## Phase C — Deletion pass (no fixed timeline — days later is fine)

- [ ] **C1. Only after B6 has been confirmed working in normal use for a while**, run
      the deletion pass, collection by collection or all at once:

  ```bash
  node scripts/migrate-to-institutions.mjs --phase=all --delete-source --dry-run --key=scripts/service-account.json
  ```

  Review, then:

  ```bash
  node scripts/migrate-to-institutions.mjs --phase=all --delete-source --key=scripts/service-account.json
  ```

  If this hits the 20,000-write daily quota partway through, it simply resumes the
  next day — no data is lost (§14.4).

- [ ] **C2. Optional, no urgency:** once flat originals are gone, the now-dead flat
      `match` blocks in `firestore.rules` (still marked "Still authoritative" in
      comments) can be removed in a later cleanup pass. Leaving them in place
      indefinitely is harmless — they just guard empty collections.

---

*Cross-reference: `FIRESTORE_INSTITUTION_NESTING_SPEC.md` §10.4 (cutover procedure),
§10.8/§10.9 (the diff-sequencing fix this runbook's step B5 reflects), §14.4/§14.7
(quota reasoning).*
