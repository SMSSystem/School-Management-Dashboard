# Demo institution: Blue Mountain Primary School

A small, fictional Jamaican primary school with dummy data from 7 September 2026 to today, made
so a prospective client can be given a read-only **spectator** login. Script:
`scripts/seed-demo-primary-school.mjs` (logic in `scripts/seedDemoPrimaryLogic.mjs`, tests in
`src/lib/__tests__/seedDemoPrimary.test.ts`). The stress-test seed
(`seed-bulk-institution.mjs`, see `BULK_SEED_SPEC.md`) is separate and untouched.

## What it creates

| Area | Content |
| --- | --- |
| Institution | "Blue Mountain Primary School", motto, fictional address and 876 phone, signatory, labels; **Institution Profile complete**; academic-year calendar mode; `flat` grading |
| Calendar | Academic year 2026-2027 (1 Sep 2026 to 31 Jul 2027), Mon-Fri; Christmas Term 7 Sep to 20 Dec, Easter Term 11 Jan to 4 Apr, Summer Term 26 Apr to 2 Jul; Jamaican public holidays as non-school days (National Heroes Day 19 Oct, and so on) |
| People | 250 students (grades 1-6, two classes each, ages by grade), about 210 parents in 158 families (siblings in different grades), 6 senior teachers (one homeroom each, class A), 10 regular teachers, 1 admin, 1 spectator |
| Structure | 4 houses (named for National Heroes), 4 departments, 12 classes, 9 subjects (Language Arts, Mathematics, Science with an assistant teacher, Social Studies, Religious Education, Physical Education, Art & Craft, Music, Spanish from grade 4), enrolments and timetable slots |
| Dated data | General attendance (AM and PM per class per school day), subject attendance (on each subject's days), 4 assignments per subject and class (published, standalone grading), weekly lesson notes for the four core subjects, a Term 1 gradebook per class and subject (Homework 1, Quiz 1, Class Test, Term Exam) with marks once a column's date has arrived, and one attendance summary per student |

Left out on purpose: assignment submissions, report cards and progress reports, results outside
the gradebook, feedback comments, discipline, enrolment registrations, photos, a logo.
Assignments, notes and marks cover **Term 1 only**; attendance runs through the last term.

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
   prints the counts (about 8,200 writes for 7 Sep to 15 Oct).
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
5. **Remove it**: `node scripts/seed-demo-primary-school.mjs --key=<path> --teardown` (dry run),
   then add `--live`. It deletes the institution and everything under it, its users and parent
   links, the six Auth accounts and the checkpoint. It only touches the checkpointed institution
   id, and only if its name is exactly the demo's.

The local checkpoint `scripts/.demo-primary-checkpoint.json` (git-ignored) holds the institution
id and what is written. Without it the script refuses to create a second institution with the
same name.

## Things to know

- **Attendance summaries use the app's own formula**, with the whole term as the denominator
  (`attendanceSummaryUtils.ts`), so mid-term rates read low in the attendance PDF. That is what
  the app itself computes when a register is saved.
- Everything is deterministic: names, marks and attendance are the same on every run, so a top-up
  never changes earlier records.
- The demo lives in the shared Firebase project like every other institution; nothing is
  separate from production data apart from its institution id.
- Free tier: no Cloud Functions or Storage; about 8,200 writes on the first run, a handful of reads.
