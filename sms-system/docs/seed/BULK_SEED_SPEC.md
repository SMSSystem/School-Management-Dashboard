# Bulk Dummy-Data Seed Script — Specification

## Table of Contents

1. [Purpose and Goals](#1-purpose-and-goals)
2. [Non-Goals](#2-non-goals)
3. [Scope Parameters (Finalized)](#3-scope-parameters-finalized)
4. [Free-Tier Cost Analysis and Daily Pacing](#4-free-tier-cost-analysis-and-daily-pacing)
5. [Data Generation Strategy](#5-data-generation-strategy)
6. [Auth Account Creation](#6-auth-account-creation)
7. [Collection Generation Plan (Write Order)](#7-collection-generation-plan-write-order)
8. [Page-by-Page UI Coverage Checklist](#8-page-by-page-ui-coverage-checklist)
9. [Script Architecture](#9-script-architecture)
10. [Daily Trigger — Windows Task Scheduler](#10-daily-trigger--windows-task-scheduler)
11. [Error Handling and Quota-Exhaustion Fallback](#11-error-handling-and-quota-exhaustion-fallback)
12. [Teardown / Cleanup Plan](#12-teardown--cleanup-plan)
13. [Risks and Accepted Tradeoffs](#13-risks-and-accepted-tradeoffs)
14. [Implementation Order](#14-implementation-order)
15. [Files](#15-files)

---

## 1. Purpose and Goals

This is a **one-off local tooling exercise**, not a product feature — it does not ship to end users and has no UI of its own. It exists to create one dedicated "stress-test" institution, populated with enough realistic dummy data to serve two purposes at once:

1. **Stress-test this app's current implementation** — exercise every list page, every generation function (Report Cards, Progress Reports, attendance summaries), every role's dashboard, and every read/write path under a data volume an order of magnitude larger than anything this codebase's existing scripts or tests have been run against.
2. **Simulate what a real academic institution's first term would actually look like** inside this app, end to end — so gaps in UX, missing empty-states, pagination behavior, and query performance at scale can be observed before a real institution ever integrates.

The institution, its users, and all of its data are considered fully disposable — see [§12](#12-teardown--cleanup-plan).

## 2. Non-Goals

- **Not a permanent seeding/demo-data tool.** `docs/guides/DEMO_TESTING_GUIDE.md` already covers the small, manual, sales-demo walkthrough use case — this spec does not replace or extend that guide.
- **Not a load-testing tool for concurrent traffic.** This seeds data sequentially, at a deliberately throttled pace, specifically to _avoid_ generating traffic spikes — it says nothing about how the app behaves under many simultaneous live users hitting it at once.
- **Not a permanent addition to `scripts/`'s migration tooling.** The existing scripts (`migrate-to-institutions.mjs`, `backfill-department-ids.mjs`, `backfill-registration-directory.mjs`) are one-time data-shape migrations for the real, shared institutions. This seed script is deliberately isolated to one throwaway institution and must never touch any other institution's data (see [§13](#13-risks-and-accepted-tradeoffs)).
- **Does not populate Events, Announcements, or Lessons.** These three collections have full Firestore rules and TypeScript types, but their create/edit forms (`EventForm`, `AnnouncementForm`, `LessonForm`) are stub components that only `console.log()` their input — they have never actually written to Firestore. Seeding data the real UI cannot itself create or edit would misrepresent what's "currently functional." If these features are wired up in the future, this spec should be revisited.
- **Does not attempt to measure or predict remaining daily quota.** Firestore/Firebase Auth expose no "quota remaining today" API on the Spark plan — see [§11](#11-error-handling-and-quota-exhaustion-fallback).

## 3. Scope Parameters (Finalized)

All numbers below were explicitly decided (not defaults) during scoping; see [§13](#13-risks-and-accepted-tradeoffs) for the judgment calls behind them.

| Parameter             | Value                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total users           | **2,500**                                                                                                                                                                                         |
| `institution_admin`   | 8                                                                                                                                                                                                 |
| `senior_teacher`      | 33                                                                                                                                                                                                |
| `regular_teacher`     | 92                                                                                                                                                                                                |
| `student`             | 1,250                                                                                                                                                                                             |
| `parent`              | 1,117                                                                                                                                                                                             |
| Institutions created  | 1 (dedicated, disposable)                                                                                                                                                                         |
| Academic data span    | **One term** (single term of one academic year — not a full year, not multiple terms)                                                                                                             |
| Data density          | **Full realism** — multi-column gradebooks (~5 columns/subject), full-term daily attendance, per-subject scheduled sessions, realistic per-student results/feedback/report cards/progress reports |
| Excluded features     | Events, Announcements, Lessons (non-functional stubs — see [§2](#2-non-goals))                                                                                                                    |
| Plan                  | **Spark (free tier) — no Blaze upgrade, no exceptions**                                                                                                                                           |
| Daily write budget    | **~10,000 writes/day** (50% of the 20,000/day cap, leaving the other half for real institutions/dev traffic sharing the same `school-sms-v1` project)                                             |
| Daily trigger         | Windows Task Scheduler, once per day, on this development machine                                                                                                                                 |
| Auth password         | One shared, clearly-labeled test password across all 2,500 seeded accounts                                                                                                                        |
| Dummy-data generation | `@faker-js/faker` (new devDependency)                                                                                                                                                             |

Class/subject/reference counts derived from the above (not independently decided, computed to fit the student/teacher population at realistic class sizes):

| Reference collection | Approx. count        | Basis                                           |
| -------------------- | -------------------- | ----------------------------------------------- |
| `classes`            | ~42                  | 1,250 students ÷ ~30/class                      |
| `subjects`           | ~10–12 core subjects | Fixed catalog, not scaled by student count      |
| `houses`             | 6                    | Fixed, typical house-system count               |
| `departments`        | ~8                   | Fixed, one per subject cluster                  |
| `academicYears`      | 1                    | The single seeded year                          |
| `terms`              | 1                    | The single seeded term (see [§2](#2-non-goals)) |

## 4. Free-Tier Cost Analysis and Daily Pacing

### 4.1 Estimated total volume (single term, 2,500 users, full realism)

| Collection                                                   | Est. writes        | Driver                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `results`                                                    | ~50,000            | 1,250 students × ~8 subjects/student × ~5 gradebook columns × 1 term                                                                                                |
| `feedback_comments`                                          | ~10,000            | 1,250 students × ~8 subjects × 1 term (deterministic upsert, 1 doc/student/subject/term)                                                                            |
| `generalAttendance`                                          | ~5,300             | ~42 classes × ~63 school days (1 term ≈ ⅓ of a ~190-day year) × 2 sessions (AM/PM) — 1 doc per class/day/session, roster embedded as a map field, **not** 1/student |
| `subjectAttendance`                                          | ~8,000–10,000      | subject-class pairings × scheduled sessions/term (frequency-dependent), roster embedded as a map field                                                              |
| `attendanceSummaries`                                        | ~1,250             | 1/student/term, deterministic upsert                                                                                                                                |
| `reportCards`                                                | ~1,250             | 1/student/term, deterministic upsert (~10 reads each — see [§4.2](#42-estimated-total-reads))                                                                       |
| `progressReports`                                            | ~1,250             | 1 generation/student/term for seeding (well under the 5-per-student-term retention cap)                                                                             |
| `reportCardComments`                                         | ~1,250             | 1/student/term                                                                                                                                                      |
| `disciplinaryActions`                                        | ~625–1,250         | ~0.5–1 record/student, arbitrary                                                                                                                                    |
| `studentActivities` + `studentResponsibilities`              | ~1,900             | ~1–2 records/student combined                                                                                                                                       |
| `users` + `student_parents` + reference data                 | ~4,200             | 2,500 users + ~1,117 parent-link docs + classes/subjects/houses/departments/timetable/exams/assignments                                                             |
| `enrollmentRegistrations` (illustrative only, not converted) | ~30–50             | Small sample so the Registrations review page has real content — see [§8](#8-page-by-page-ui-coverage-checklist)                                                    |
| **Total**                                                    | **~87,000–95,000** |                                                                                                                                                                     |

### 4.2 Estimated total reads

| Source                                                                                             | Est. reads         |
| -------------------------------------------------------------------------------------------------- | ------------------ |
| Report Card generation (~10 reads × 1,250 students)                                                | ~12,500            |
| Progress Report generation (~7 reads × 1,250 students)                                             | ~8,750             |
| Attendance-summary rebuild (reads all `generalAttendance`/`subjectAttendance` docs per class+term) | ~5,000–8,000       |
| Misc. lookups during generation (subject/class/term dedup reads across all phases)                 | ~5,000             |
| **Total**                                                                                          | **~30,000–35,000** |

Reads stay comfortably under a single day's 50,000/day cap even in one run — **writes are the sole pacing constraint.**

### 4.3 Daily pacing

At the decided **~10,000 writes/day** budget:

```
~90,000 total writes ÷ 10,000/day ≈ 9–10 daily runs to completion
```

This leaves **~10,000 writes/day (50%) and ~50,000 reads/day (100%, essentially untouched)** free for real institutions and developer activity on `school-sms-v1` throughout the seeding window.

### 4.4 Storage

Even at ~95,000 documents, estimated total storage is well under 100 MB (small documents; the largest per-doc payloads are the map-embedded attendance rosters at a few KB each) — **nowhere near** the 1 GiB Spark storage cap. Storage is not a constraint for this exercise.

## 5. Data Generation Strategy

- **`@faker-js/faker`** is added as a new **devDependency** (not shipped in the production bundle — same category as `firebase-admin`/`firebase-tools`, already dev-only tooling). Used for names, addresses, phone numbers, and other realistic-looking filler content.
- **Emails** use a clearly fake, non-deliverable domain scoped to this seed (e.g. `@seed.test` or similar — final domain chosen at implementation time), so there is no risk of the script ever emailing a real person or colliding with a real account.
- **Determinism**: the script seeds Faker's RNG with a fixed value at the start of each run, so re-running against the same checkpoint state (e.g. after a crash) regenerates the _same_ names for the _same_ logical user index — avoiding accidental duplicate-but-differently-named records if a phase partially reruns.
- Institution name, address, and branding fields are also Faker-generated but clearly labeled as a test institution (e.g. name suffixed `(Seed Test Institution)`), so it's unmistakable in any admin-facing list (this matters for [§13](#13-risks-and-accepted-tradeoffs) — this institution must never be mistaken for a real one by anyone with `super_admin` access).

## 6. Auth Account Creation

- Uses the Firebase Admin SDK (`firebase-admin/auth`), run locally with a service-account key — the same credential pattern as the existing `scripts/*.mjs` migration scripts (gitignored key, never committed, "run locally only" per their own docstrings).
- **`auth().importUsers()`** (bulk import, up to 1,000 accounts per call — 3 calls cover all 2,500) is used instead of looping `createUser()` calls one at a time. This is the correct tool for this job and has never been used in this codebase before (every account historically has been created one at a time via the client SDK's `createUserWithEmailAndPassword`, inside a real signed-in admin's browser session — see prior feasibility discussion). `importUsers()` requires a password hash algorithm; the script will either supply a pre-hashed shared password (matching Firebase Auth's expected hash config) or fall back to `createUser()` in modest concurrent batches if `importUsers()`'s hashing requirements prove awkward to satisfy locally — this choice is finalized at implementation time, not fixed here.
- **One shared, clearly-labeled test password** is used for all 2,500 accounts (decided in [§3](#3-scope-parameters-finalized)) — documented in the script's own header comment and in this spec, not treated as a secret (this is an isolated, disposable institution nobody else has any reason to sign into).
- Every seeded `users/{uid}` Firestore document is written via the Admin SDK too (bypasses `firestore.rules` entirely, same as the Admin SDK's Firestore writes elsewhere in this script — this is expected and accepted for a local, trusted, service-account-authenticated script; see [§13](#13-risks-and-accepted-tradeoffs)).

## 7. Collection Generation Plan (Write Order)

Phases run strictly in this order — later phases depend on IDs/data produced by earlier ones. Each phase is independently checkpointable (see [§9](#9-script-architecture)).

| Phase | Collections written                                                                                                                                                                                   | Depends on              | Approx. writes   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ---------------- |
| 0     | `institutions/{id}` (fully profile-complete — required for Report Card generation's `profileComplete` gate), `registration_directory/{id}` (not accepting registrations)                              | —                       | 2                |
| 1     | `academicYears`, `terms` (single term)                                                                                                                                                                | Phase 0                 | 2                |
| 2     | Auth accounts + `users/{uid}` for all 2,500 people (admins → senior teachers → regular teachers → students → parents, in that order so later phases can reference already-created teacher/admin UIDs) | Phase 0                 | 2,500            |
| 3     | `student_parents` links                                                                                                                                                                               | Phase 2                 | ~1,117           |
| 4     | `houses`, `departments`, `classes` (supervisor = a real teacher UID), `subjects` (teacherIds = real teacher UIDs)                                                                                     | Phase 2                 | ~70              |
| 5     | Student→class and student→house assignment (batched `updateDoc` on `users/{uid}`, no new documents)                                                                                                   | Phases 2, 4             | 0 (updates only) |
| 6     | `timetable_slots`, `exams`, `assignments`                                                                                                                                                             | Phase 4                 | ~500–1,000       |
| 7     | `gradebooks` + `gradebooks/{id}/columns` (~5/subject)                                                                                                                                                 | Phase 4                 | ~500–600         |
| 8     | `results` (1/student/gradebook-column, deterministic)                                                                                                                                                 | Phases 5, 7             | ~50,000          |
| 9     | `feedback_comments` (1/student/subject/term, deterministic upsert)                                                                                                                                    | Phase 8                 | ~10,000          |
| 10    | `generalAttendance` (1/class/day/session for the term)                                                                                                                                                | Phase 5                 | ~5,300           |
| 11    | `subjectAttendance` (1/subject-class/scheduled session)                                                                                                                                               | Phases 4, 5             | ~8,000–10,000    |
| 12    | `attendanceSummaries` (rebuild-equivalent, 1/student/term)                                                                                                                                            | Phases 10, 11           | ~1,250           |
| 13    | `studentActivities`, `studentResponsibilities`, `disciplinaryActions`                                                                                                                                 | Phase 5                 | ~2,500–3,150     |
| 14    | `reportCardComments`                                                                                                                                                                                  | Phase 5                 | ~1,250           |
| 15    | `reportCards` (generation-equivalent — reads Phases 8, 9, 12, 13, 14)                                                                                                                                 | Phases 8, 9, 12, 13, 14 | ~1,250           |
| 16    | `progressReports` (generation-equivalent — reads Phase 8)                                                                                                                                             | Phase 8                 | ~1,250           |
| 17    | `enrollmentRegistrations` — small illustrative sample only, not converted to accounts, so the Registrations page has real content ([§8](#8-page-by-page-ui-coverage-checklist))                       | Phase 0                 | ~30–50           |

## 8. Page-by-Page UI Coverage Checklist

Derived directly from `src/components/Menu.tsx` (every sidebar entry) and `src/App.tsx` (every registered route, including detail pages not in the sidebar), cross-referenced with role visibility. "Populated by" references the phase(s) in [§7](#7-collection-generation-plan-write-order).

### People

| Page                     | Route                              | Roles                                  | Populated by                                                |
| ------------------------ | ---------------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| Create Account           | `/dashboard/create-user`           | super_admin, institution_admin         | N/A — action-only page, functions regardless of seeded data |
| Teachers (list + detail) | `/dashboard/list/teachers`, `/:id` | admin, senior_teacher, regular_teacher | Phase 2                                                     |
| Students (list + detail) | `/dashboard/list/students`, `/:id` | admin, senior_teacher, regular_teacher | Phase 2, 5                                                  |
| Parents                  | `/dashboard/list/parents`          | admin, senior_teacher, regular_teacher | Phase 2                                                     |
| Registrations            | `/dashboard/registrations`         | admin                                  | Phase 17                                                    |

### Curriculum

| Page                   | Route                            | Roles                                  | Populated by |
| ---------------------- | -------------------------------- | -------------------------------------- | ------------ |
| Subjects               | `/dashboard/list/subjects`       | admin                                  | Phase 4      |
| Departments            | `/dashboard/list/departments`    | admin                                  | Phase 4      |
| Houses (list + detail) | `/dashboard/list/houses`, `/:id` | institution_admin                      | Phase 4, 5   |
| Classes                | `/dashboard/list/classes`        | admin, senior_teacher, regular_teacher | Phase 4      |

### Timetable

| Page        | Route                         | Roles                                  | Populated by                                             |
| ----------- | ----------------------------- | -------------------------------------- | -------------------------------------------------------- |
| Terms       | `/dashboard/list/terms`       | admin                                  | Phase 1                                                  |
| Schedule    | `/dashboard/schedule`         | all roles                              | Phase 6                                                  |
| Lessons     | `/dashboard/list/lessons`     | admin, senior_teacher, regular_teacher | **Not populated** — stub feature, see [§2](#2-non-goals) |
| Exams       | `/dashboard/list/exams`       | admin, teachers, student, parent       | Phase 6                                                  |
| Assignments | `/dashboard/list/assignments` | admin, teachers, student, parent       | Phase 6                                                  |

### Outcomes

| Page                 | Route                                   | Roles                                  | Populated by                                                           |
| -------------------- | --------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Gradebook            | `/dashboard/list/gradebook`             | admin, senior_teacher, regular_teacher | Phase 7, 8                                                             |
| Results              | `/dashboard/list/results`               | admin, teachers, student, parent       | Phase 8                                                                |
| Feedback             | `/dashboard/list/feedback`              | admin, senior_teacher, regular_teacher | Phase 9                                                                |
| Report Card Comments | `/dashboard/report-card-comments`       | institution_admin                      | Phase 14                                                               |
| Report Cards         | `/dashboard/report-cards`               | admin, teachers, student, parent       | Phase 15                                                               |
| Progress Reports     | `/dashboard/progress-reports`           | admin, teachers, student, parent       | Phase 16                                                               |
| Disciplinary Action  | `/dashboard/disciplinary-actions`       | all roles                              | Phase 13                                                               |
| Report Builder       | `/dashboard/reports/builder`            | admin, senior_teacher                  | Phase 15 (reuses report card pool)                                     |
| Grade Tracking       | `/dashboard/admin/grade-entry-tracking` | admin                                  | **No separate write** — pure read-time aggregation over Phases 6, 8, 9 |
| Import Data          | `/dashboard/import`                     | admin, senior_teacher, regular_teacher | N/A — action-only page (this seed doesn't route data through it)       |

### Attendance

| Page              | Route                                           | Roles                  | Populated by                                                                                                                                 |
| ----------------- | ----------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Academic Calendar | `/dashboard/academic-calendar`                  | institution_admin      | Phase 1                                                                                                                                      |
| General Register  | `/dashboard/attendance/general`                 | admin, senior_teacher  | Phase 10                                                                                                                                     |
| Summary Register  | `/dashboard/attendance/gridsheet`               | admin, senior_teacher  | Phase 10, 11, 12                                                                                                                             |
| Subject Register  | `/dashboard/attendance/subject`                 | admin, regular_teacher | Phase 11                                                                                                                                     |
| My Attendance     | `/dashboard/attendance/my`                      | student                | Phase 10, 11, 12 (own-student filtered view)                                                                                                 |
| Child Attendance  | `/dashboard/attendance/child`                   | parent                 | Phase 10, 11, 12 (linked-student filtered view)                                                                                              |
| Backfill Classes  | `/dashboard/admin/backfill-student-classes`     | admin                  | N/A — one-time maintenance utility, not applicable (this seed writes `classId` correctly from the start)                                     |
| Rebuild Summaries | `/dashboard/admin/rebuild-attendance-summaries` | institution_admin      | N/A — action-only page; Phase 12 pre-computes summaries directly, but the page itself remains fully usable against the seeded data afterward |

### Other

| Page                                   | Route                            | Roles                                   | Populated by                                                |
| -------------------------------------- | -------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| User Profile                           | `/dashboard/profile`             | all roles                               | Phase 2 (every seeded user has a complete profile)          |
| Settings                               | `/dashboard/settings`            | all roles                               | N/A — local UI state, no seed dependency                    |
| Brand Settings                         | `/dashboard/brand-settings`      | super_admin                             | Not applicable to this seed — global/cross-institution page |
| Institution Profile / Institution Info | `/dashboard/institution-profile` | institution_admin (edit), others (read) | Phase 0 (fully profile-complete)                            |

### Role home dashboards (`/dashboard`, role-routed)

| Role              | Component            | Populated by                                                                  |
| ----------------- | -------------------- | ----------------------------------------------------------------------------- |
| super_admin       | `SuperAdminPage`     | Phase 0, 2 (sees the new institution + its admins in cross-institution views) |
| institution_admin | `AdminPage`          | All phases (aggregate dashboard)                                              |
| senior_teacher    | `SeniorTeacherPage`  | Phases 4–16 (their assigned classes/subjects)                                 |
| regular_teacher   | `RegularTeacherPage` | Phases 4–16 (their assigned classes/subjects)                                 |
| student           | `StudentPage`        | Phases 5, 8–16 (their own records)                                            |
| parent            | `ParentPage`         | Phases 3, 5, 8–16 (their linked children's records)                           |

### Super-admin-only, cross-institution pages

`Manage Admins`, `Audit Log`, `Onboard Institution` are not institution-scoped — they become meaningfully populated simply because the seeded institution and its 8 admins exist (Phase 0, 2); no dedicated seed phase targets them directly.

## 9. Script Architecture

- **Language/runtime**: Node.js `.mjs` (ESM), matching the existing `scripts/*.mjs` convention exactly.
- **Credentials**: a local service-account key file (gitignored, same pattern as `scripts/service-account.json` already excluded via `.gitignore`'s `scripts/*service-account*.json` rule).
- **Checkpoint file**: a single local JSON file (e.g. `scripts/.seed-checkpoint.json`, gitignored) recording, per phase: `status` (`pending` / `in_progress` / `complete`), and enough cursor state (e.g. last-written index within a phase's generation loop) to resume mid-phase, not just at phase boundaries — a phase like Phase 8 (`results`, ~50,000 writes) cannot be all-or-nothing against a 10,000-write daily budget; it must be resumable _within itself_ across multiple days.
- **Idempotency**: every write within a phase uses a deterministic, derivable document ID or a pre-computed existence check, so re-running a partially-completed phase (whether resuming normally or recovering from an unexpected interruption) never creates duplicate documents. Where the app's own conventions already use deterministic IDs (`attendanceSummaries`, `feedback_comments`, `student_parents`), the script reuses those same ID schemes; where the app uses `addDoc`-style random IDs (`results`, `reportCards` new-doc case, etc.) the script tracks written keys in the checkpoint file instead.
- **Per-run write budget**: the script tracks a running write counter for the current invocation and stops cleanly (persisting the checkpoint) once it reaches the ~10,000/day budget, even if the current phase isn't finished — it does not attempt to finish "just one more phase" past budget.
- **Batching**: reuses the existing `BATCH_LIMIT = 450` convention from `scripts/migrate-to-institutions.mjs` / `backfill-department-ids.mjs` / `src/lib/spreadsheetImport.ts` (safety margin under Firestore's hard 500-operation batch cap).
- **Logging**: each run prints a summary (phase, writes this run, cumulative writes, estimated runs remaining) to stdout, and Windows Task Scheduler is configured to redirect that output to a local log file for later review without needing to watch the console live.

## 10. Daily Trigger — Windows Task Scheduler

- A Task Scheduler task runs `node scripts/seed-bulk-institution.mjs` once per day at a fixed, low-traffic time, on this development machine.
- The task's working directory is `sms-system/`, and it points at the same local service-account key file used by the existing migration scripts.
- **Resilience**: because the checkpoint file is the sole source of truth for progress, a missed day (machine off, asleep, or the task simply not firing) costs nothing but time — the next successful run resumes exactly where the last one left off. No day-counting or date-based logic is needed in the script itself; it always just "does today's budget of work, starting from the checkpoint."
- Task Scheduler configuration specifics (trigger time, run-only-if-machine-is-on settings, retry-on-failure policy) are an implementation detail settled when the script is actually built, not fixed by this spec.

## 11. Error Handling and Quota-Exhaustion Fallback

Firestore/Firebase Auth expose no client-queryable "quota remaining today" endpoint on Spark — the daily cap is only detectable reactively, via a write actually failing with a `resource-exhausted` (or equivalent quota) error. Per the finalized decision:

- On any such error, the script **stops immediately** — no retry loop, no backoff-and-hammer behavior that could make the situation worse for real traffic sharing the same project.
- The checkpoint is persisted **up to the last successful write** before the failure (never past it), so the next scheduled run resumes cleanly.
- This can happen even under the script's own conservative ~10,000/day self-imposed budget if real traffic on `school-sms-v1` consumes an unexpectedly large share of the shared 20,000/day cap on a given day — this is an accepted, self-healing scenario, not a failure condition requiring intervention.
- Any other (non-quota) error — a malformed record, an unexpected missing reference — is logged with full context (phase, record index, error) and also stops the run rather than silently skipping, so data-integrity problems can't accumulate unnoticed across a multi-day run.

## 12. Teardown / Cleanup Plan

Since this is explicitly throwaway stress-test data, cleanup needs its own plan — Firestore has no cascade-delete, so every nested collection must be deleted explicitly, and Auth accounts are a separate deletion entirely from their Firestore documents.

- A companion script (e.g. `scripts/teardown-bulk-institution.mjs`) reads the same institution ID the seed script used, and:
  1. Deletes every document in every `institutions/{id}/{collection}` subcollection (iterating each collection named in [§7](#7-collection-generation-plan-write-order), batched at the same 450-op limit).
  2. Deletes the `users/{uid}` documents and `student_parents/{id}` links for all 2,500 seeded people (identified via the checkpoint file's recorded UID list, not a broad query, to guarantee zero risk of touching any real institution's data).
  3. Deletes the corresponding 2,500 Firebase Auth accounts via `auth().deleteUsers()` (bulk delete, up to 1,000 UIDs per call — 3 calls) — the efficient counterpart to `importUsers()` used for creation.
  4. Deletes the `institutions/{id}` and `registration_directory/{id}` documents last.
- Like the seed script itself, teardown respects the same daily write/delete budget and is resumable via its own checkpoint — deleting ~90,000 documents is itself a multi-day operation under the same Spark constraints (Firestore deletes share the 20,000/day delete quota, separate from but just as real as the write quota).
- Teardown is **not run automatically** after seeding completes — it's a separate, deliberately-invoked script, run whenever the stress test is actually finished with.

## 13. Risks and Accepted Tradeoffs

- **Shared project quota**: `school-sms-v1` is the one Firebase project behind every real institution and every dev/test session. The ~10,000/day self-imposed budget is a mitigation, not a guarantee — a real institution having an unusually heavy day at the same time could still contend for quota. This was weighed explicitly and accepted rather than paying for Blaze.
- **Admin SDK bypasses `firestore.rules` and App Check entirely.** This is expected and standard for a trusted, local, service-account-authenticated script (identical to how the existing `scripts/*.mjs` migration tools already operate) — but it means the seed script's own internal correctness (never writing to any institution ID other than its own dedicated one) is the _only_ safety net, since the rules layer that protects every other write path in this app does not apply here. The script must hard-code / checkpoint-record its one target institution ID and never derive it from anything queried at runtime.
- **`importUsers()`'s password-hash requirements** may turn out to be awkward to satisfy for a simple shared plaintext password — [§6](#6-auth-account-creation) leaves the exact mechanism (`importUsers()` vs. concurrent `createUser()` batches) as an implementation-time decision rather than over-specifying it here.
- **Role ratio realism**: 8/33/92/1,250/1,117 is a deliberately-chosen realistic staff:student ratio (~1:11), not the literal pyramid numbers first proposed — a documented, explicit judgment call, not a default.
- **Single term only**: this seed does not exercise cross-term behavior (e.g. a student's Progress Report history spanning multiple terms, term-to-term promotion, multi-year Report Builder batches). That's an explicit scope cut, not an oversight — extending to multiple terms later is straightforward (multiply the relevant phases) but was deliberately deferred to keep this exercise's cost and runtime bounded.
- **`enrollmentRegistrations` sample data (Phase 17) is illustrative only** — those records are never actually converted into accounts (the 2,500 users all come from Phase 2's direct Admin SDK creation), so the Registrations page will show entries whose "Convert to Account" action, if clicked, would create _additional_ accounts beyond the planned 2,500. This is acceptable for read/list-page testing but worth remembering if someone starts clicking around in that page during the stress test.

## 14. Implementation Order

1. Add `@faker-js/faker` devDependency.
2. `scripts/seed-bulk-institution.mjs` — Phase 0-1 (institution, academic year, term).
3. Phase 2 (Auth + `users` — the highest-risk, least-precedented phase; validate `importUsers()`/`createUser()` approach here first, before building anything that depends on it).
4. Phase 3-7 (links, reference data, timetable/exams/assignments, gradebooks/columns).
5. Phase 8-9 (`results`, `feedback_comments` — the highest-volume phases; validate checkpoint/resume behavior mid-phase here, since these are the ones most likely to span multiple daily runs on their own).
6. Phase 10-12 (attendance registers + summaries).
7. Phase 13-17 (disciplinary/activities/responsibilities, report card comments, report cards, progress reports, illustrative registrations).
8. Windows Task Scheduler configuration.
9. `scripts/teardown-bulk-institution.mjs`.

## 15. Files

| File                                               | Role                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `sms-system/scripts/seed-bulk-institution.mjs`     | New — the seed script itself                                                                  |
| `sms-system/scripts/teardown-bulk-institution.mjs` | New — companion cleanup script                                                                |
| `sms-system/scripts/.seed-checkpoint.json`         | New, gitignored — resumable progress state                                                    |
| `sms-system/scripts/service-account.json`          | Existing, gitignored — reused, not duplicated                                                 |
| `sms-system/package.json`                          | Modified — add `@faker-js/faker` devDependency, add `seed:bulk` / `teardown:bulk` npm scripts |
| `sms-system/.gitignore`                            | Modified — add the checkpoint file pattern                                                    |
