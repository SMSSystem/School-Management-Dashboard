# Demo institution: Blue Mountain Primary School

A small, fictional Jamaican primary school with dummy data from 7 September 2026 to today, made
so a prospective client can be given a read-only **spectator** login. Script:
`scripts/seed-demo-primary-school.mjs` (logic in `scripts/seedDemoPrimaryLogic.mjs`, tests in
`src/lib/__tests__/seedDemoPrimary*.test.ts`). The stress-test seed
(`seed-bulk-institution.mjs`, see `BULK_SEED_SPEC.md`) is separate and untouched.

## What it creates

| Area        | Content                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Institution | "Blue Mountain Primary School", motto, fictional address and 876 phone, signatory, labels; **Institution Profile complete**; academic-year calendar mode; `flat` grading                                                                                                                                                                                                                            |
| Calendar    | Academic year 2026-2027 (1 Sep 2026 to 31 Jul 2027), Mon-Fri; Christmas Term 7 Sep to 20 Dec, Easter Term 11 Jan to 4 Apr, Summer Term 26 Apr to 2 Jul; Jamaican public holidays as non-school days (National Heroes Day 19 Oct, and so on)                                                                                                                                                         |
| People      | 250 students (grades 1-6, two classes each, ages by grade), about 210 parents in 158 families (siblings in different grades), 6 senior teachers (one homeroom each, class A), 10 regular teachers, 1 admin, 1 spectator                                                                                                                                                                             |
| Structure   | 4 houses (named for National Heroes), 4 departments, 12 classes, 9 subjects (Language Arts, Mathematics, Science with an assistant teacher, Social Studies, Religious Education, Physical Education, Art & Craft, Music, Spanish from grade 4), enrolments and timetable slots                                                                                                                      |
| Dated data  | General attendance (AM and PM per class per school day), subject attendance (on each subject's days), 4 assignments per subject and class (published, standalone grading), weekly lesson notes for the four core subjects, a Term 1 gradebook per class and subject (Homework 1, Quiz 1, Class Test, Term Exam) with marks once a column's date has arrived, and one attendance summary per student |

Added in a second pass (all fictional, dated up to the seed date):

| Area                          | Content                                                                                                                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rubrics                       | 6 primary rubrics (Paragraph Writing, Oral Presentation, Science Project, Art & Craft Project, Reading Response, Group Work); about 30 grade 4-6 assignments carry one (matched by title)                                                                              |
| Results                       | Manual-entry results for the four core subjects, two assessments each by 15 Oct and two more later in Term 1. The Results page **hides gradebook marks** (it shows manual entries only), so pick a class and subject there                                             |
| Disciplinary Actions          | A primary-school mix: mostly merits, some demerits and detentions, very few suspensions; a detention or suspension is recorded once it has ended                                                                                                                       |
| Progress Reports              | One snapshot per student after each gradebook column (12 Oct, 16 Nov, 11 Dec), averaging every result to that date                                                                                                                                                     |
| Report cards / Report Builder | One Term 1 report card per student with class rank and average, attendance, activities, positions of responsibility and discipline counts, plus the feedback comments (one per student and subject), report-card comments, activities and responsibilities behind them |

**Report cards are interim until the Term Exam column has marks.** The app's own formula adds
score/max x column weight, so with only Homework 1 (15) and Quiz 1 (20) marked a student can reach
only 35 and would look like they are failing. The seed scales each grade to the weight assessed so
far, so grades look normal. Every seed run regenerates them (about 250 writes); once all four columns
have marks the result is exactly the app's formula. If an admin presses "Generate" in the app
mid-term, the app's own unscaled numbers replace them.

Left out on purpose: assignment submissions, progress reports beyond the three snapshots,
enrolment registrations, photos, a logo. Assignments, notes, marks and report cards cover
**Term 1 only**; attendance runs through the last term.

## Who can sign in

Six accounts (Firebase Auth uids are fixed): `bmpsadm001` (institution admin), `bmpsspe001`
(spectator, `spectator@bluemountainps.test`), `bmpssen001` (senior teacher), `bmpsreg001`
(regular teacher), `bmpspar001` (parent) and `bmpsstu001` (their child). Everyone else exists
only as a record: they show in every list and report but cannot sign in, and none show as
"awaiting first sign-in". Passwords are generated and printed **once** by the live run; they are
never written to a file. The institution appears in the sign-in picker like any other.

## Run it

All commands run from `sms-system/`.

1. **Dry run** (no key needed, writes nothing): `node scripts/seed-demo-primary-school.mjs`
   prints the counts (about 13,400 writes in total for 7 Sep to 15 Oct: about 8,200 for the first
   set and about 5,200 for the second; run on a later day or with a lower `--budget` to spread them).
2. **Live**: `node scripts/seed-demo-primary-school.mjs --key=scripts/service-account.json --live`.
   Copy the printed passwords. `--budget=<n>` caps one run (default 9,000 of the 20,000 daily
   free-tier writes); if the budget runs out it says so, and running again continues.
3. **Top up** (for example the day before a pitch): run the same command again. It adds only
   the days since the last run (a few hundred writes per school week) and refreshes the
   attendance summaries and term statuses. `--through=YYYY-MM-DD` seeds up to an earlier date;
   it never seeds past today.
4. **Real spectator address**: dry run first, then add `--live`:
   `node scripts/set-account-email.mjs --uid=bmpsspe001 --email=<address> --key=scripts/service-account.json`.
   Then an admin can send the first-sign-in email from the app. If a password is lost, reset the
   admin's with `node scripts/reset-qa-institution-admin-password.mjs --institution-name="Blue Mountain Primary School" --key=<path>`
   (admin accounts only; the demo's name is on that script's allow-list).
5. **Clear the spectator's Activity list** (the sign-ins on the User Profile page), last, after your
   own test sign-ins: `node scripts/clear-demo-activity-log.mjs --key=scripts/service-account.json`
   (dry run, prints the number and date range only), then add `--live`. It only accepts the six
   demo accounts (default `bmpsspe001`), and only the `activity_log` entries. Every later sign-in,
   including the prospect's first, adds one.
6. **Remove it**: `node scripts/seed-demo-primary-school.mjs --key=<path> --teardown` (dry run),
   then add `--live`. It deletes the institution and everything under it, its users and parent
   links, the six Auth accounts and the checkpoint. It only touches the checkpointed institution
   id, and only if its name is exactly the demo's.

The local checkpoint `scripts/.demo-primary-checkpoint.json` (git-ignored) holds the institution
id and what is written. Without it the script refuses to create a second institution with the
same name.

## Read cost of the data-heavy pages (Spark: 50,000 reads a day)

The seeded data is bigger than a typical test institution, so a few pages are worth knowing about
before the demo. Counts are approximate for 15 Oct (they grow with the term).

| Page                        | Reads per visit                                      | Note                                             |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Feedback                    | up to 100                                            | Capped to the newest 100 comments                |
| Grade-Entry Tracking        | about 8,400 on "Load tracking", then 0 for 5 minutes | Loads only on request; do not open it repeatedly |
| Progress Reports            | about 250 (about 750 after December)                 | Whole collection                                 |
| Report Cards                | about 250                                            | Whole collection                                 |
| Report Builder              | about 250 per term change                            | Term's report cards                              |
| Disciplinary Actions        | about 45                                             | Whole collection                                 |
| Students, Teachers, Parents | about 475 once, then served from the cache           | Shared users list                                |

## Things to know

- **Attendance summaries use the app's own formula**, with the whole term as the denominator
  (`attendanceSummaryUtils.ts`), so mid-term rates read low in the attendance PDF. That is what
  the app itself computes when a register is saved.
- Everything is deterministic: names, marks and attendance are the same on every run, so a top-up
  never changes earlier records. The one exception is a one-off correction: the report signatory was
  changed from "Mrs. L. Henry" to "Mrs. B. Henry" (the admin's name), so the first run after that
  change also patches the institution and the first progress reports (about 251 writes) and rewrites
  the report cards once (a checkpoint version triggers it).
- "Today" is Jamaica's date (UTC-5), so a run in the evening does not seed tomorrow.
- The demo lives in the shared Firebase project like every other institution; nothing is
  separate from production data apart from its institution id.
- Free tier: no Cloud Functions or Storage; about 8,200 writes for the first set and about 5,200 for the second, a handful of reads.
