# Changelog

All notable changes to the School Management System, newest first. Versions follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) as this project applies it in [sms-system/docs/VERSIONING.md](sms-system/docs/VERSIONING.md); the layout is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Click a version to open it. Versions before v2.39.0 were recorded after the fact from the git history, one per pull request merged into `main`.

**Current version:** v2.56.0 · **Last updated:** 2026-11-20

## Unreleased

**Added**

- Staff see "N unsent" in the header while register saves wait on the device. It opens a list of every unsent register, with choices to send now, settle a clash, discard or export.
- Logout warns first when registers haven't been sent, with the choice to send now, export them or sign out anyway. The work stays on the device for the next sign-in.
- After signing in, a notice says when saves from an earlier session are being sent.
- Saves not sent within 7 days stop sending on their own and ask what to do: send anyway, export to a spreadsheet file, or discard. Nothing is deleted without a click.

**Fixed**

- The "can't reach the server" banner now sits at the bottom of the screen, behind any open dialog, so it no longer covers the Logout button or a dialog's buttons.
- With the outbox switched off, discarding a queued save no longer sends the rest.

## 2.x — data nested under each institution (2026-08-03 onward)

<a id="v2.56.0"></a>
<details open>
<summary><strong>v2.56.0</strong> · 2026-11-20 · Offline Register Outbox (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/116">#116</a>)</summary>

**Added**

- Register saves can now be kept on the device and sent when the connection allows. The Save button says "saved on this device", then "Sending…", then ✓. Nothing typed is lost if the connection drops while saving.
- If someone else changed the same students on another device in the meantime, the register asks which mark to keep for each, instead of overwriting.
- This is off until switched on for a school.

**Deploy notes**

- Deploy the Firestore rules (`firebase deploy --only firestore:rules`) before the release: a regular teacher may now read a subject register that doesn't exist yet, by its fixed id.
- The outbox stays off until a super admin sets `offlineOutbox: true` (a boolean) on an institution document in the Firebase console. It takes effect at each person's next sign-in or reload.

</details>

<a id="v2.55.0"></a>
<details>
<summary><strong>v2.55.0</strong> · 2026-11-19 · Offline Attendance Registers and Today's Prefetch (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/115">#115</a>)</summary>

**Added**

- In a tab that's already open, the General and Subject Attendance registers keep working without the internet, from a copy saved on the device the last time they were opened online. A notice says when the copy was saved. Loading the app itself offline comes later.
- After an online sign-in, teachers' registers for today are fetched in the background, once a day on each device: a senior teacher's homeroom, and each class a regular teacher has a subject session with today. In an open tab, they open even if the connection drops before the teacher gets to them.

**Changed**

- A register saved while offline now shows "Waiting for connection" instead of spinning, and says the marks are kept on the device until the connection returns.

</details>

<a id="v2.54.0"></a>
<details>
<summary><strong>v2.54.0</strong> · 2026-11-19 · Offline-Safe Start and Encrypted Attendance Drafts (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/114">#114</a>)</summary>

**Changed**
- Reloading the page while offline no longer signs staff out. The app carries on from a copy of their profile saved earlier in that tab, and checks with the server again when the connection returns.
- If there's no saved copy yet, a "Can't reach the server" screen waits for the connection instead of signing out.

**Security**
- Unsaved attendance drafts, including excuse reasons, are now encrypted on the device rather than kept in plain browser storage. Existing drafts move across automatically.
- Each staff member gets a random encryption key, readable only by them, and the device's copy is removed at sign-out.

**Deploy notes**
- Deploy the Firestore rules first: `firebase deploy --only firestore:rules`. They add the owner-only key document (`users/{uid}/deviceKeys/outbox`). If the app goes out first, it behaves as before until the rules are live.

</details>

<a id="v2.53.0"></a>
<details>
<summary><strong>v2.53.0</strong> · 2026-11-18 · Bug Sweep: Filters, Exams and Forms</summary>

- **Added:** Assignments and both Exams lists get a Subject dropdown and subject chips, and Lesson Notes gets a Newest first / A–Z sort. On Create Account and Edit Student, Additional classes is now a search box instead of a long list of checkboxes, and the Spectators page shows whether each spectator has signed in yet.
- **Changed:** Lesson Notes lists notes by when they were created, so editing a note no longer moves it to the top. Student Details shows the additional classes in their own card, and a student's or parent's Rubric section on an assignment starts folded.
- **Changed:** the register Fill button can now overwrite the students marked differently in a column, and never changes those who already have that mark. The Gradebook's Class list shows only the classes of the selected term.
- **Fixed:** on the exam screen, the flag button reads "Flag" on phones, the timer stays in view on wide screens and older browsers, "Not saved to the server yet" is gone, a failed save says so plainly, and "Time's up!" is a real heading.
- **Fixed:** the Student, Subject and Class options in the Result and feedback comment forms are alphabetical, and the Exams lists fit narrow screens.
- **Deploy notes:** run `firebase deploy --only firestore:indexes` and wait for the four new `lessonNotes` `createdAt` indexes to finish building **before** this build goes live, or the Lesson Notes page will not load. No rules change. The four older `lessonNotes` `updatedAt` indexes stay for now and can be removed in a later change.

</details>

<a id="v2.52.0"></a>
<details>
<summary><strong>v2.52.0</strong> · 2026-11-17 · Upcoming Exam Card on the Student Home Page</summary>

- **Added:** the student Home page now opens with an orange "Upcoming exam" card when one of the student's classes has an exam in the next seven days. It sits above Next class.
- **Added:** the card shows the soonest exam's day, time and type, and lists up to three more. A button opens the Exams page, and it reads "Take it now" while an online exam is open.
- **Changed:** students with no exam that week see Home as before. The card reuses the Exams page's cached exam list, so it costs no extra reads after the Exams page has loaded.

</details>

<a id="v2.51.1"></a>
<details>
<summary><strong>v2.51.1</strong> · 2026-11-16 · Simpler Exam, Assignment and Rubric Forms</summary>

- **Changed:** the forms for exams, assignments and rubrics, and the add, edit and delete dialog, were reorganised behind the scenes so they are easier to maintain. Nothing changes in how they look or work.

</details>

<a id="v2.51.0"></a>
<details>
<summary><strong>v2.51.0</strong> · 2026-11-16 · Deleting Assignments with Their Submissions (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/110">#110</a>)</summary>

- **Changed:** deleting an assignment now also deletes every student's submission for it, with each attempt and file. The dialog says how many, and grades already given stay in Results, the gradebook and report cards.
- **Added:** a report for the owner that finds submissions left behind by assignments deleted before this change, and removes them only when asked.
- **Added:** editing a rubric's criteria now warns that the change affects every assignment using it, including any already graded.
- **Changed:** the rubric tour and the user guide now explain what is kept when a file is read into a grid, and that students can technically read any rubric file.
- **Deploy notes:** `firebase deploy --only firestore:rules` (already done on 2026-11-16). Optionally run `node scripts/prune-orphan-submissions.mjs --key=<path>` as a dry run, then with `--live`.

</details>

<a id="v2.50.2"></a>
<details>
<summary><strong>v2.50.2</strong> · 2026-11-16 · Rubric File Report (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/109">#109</a>)</summary>

- **Added:** a read-only report for the owner of each school's rubric files: how many there are, their total and largest size, how close the school is to the 200-file limit, and how many are PDF, Excel, Word, Markdown or CSV. It counts first and only reads the rubrics when asked, and never downloads the files.

</details>

<a id="v2.50.1"></a>
<details>
<summary><strong>v2.50.1</strong> · 2026-11-15 · Shared Rubric List and Shorter Level Rows (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/108">#108</a>)</summary>

- **Changed:** the Rubrics page and the rubric list on the assignment form now share one live list, so opening one after the other, or coming back within five minutes, doesn't load the rubrics again.
- **Changed:** when you edit a rubric or review one read from a file, each level's label, points and description now sit on one row on larger screens, so the grid is shorter. On phones they still stack.

</details>

<a id="v2.50.0"></a>
<details>
<summary><strong>v2.50.0</strong> · 2026-11-15 · Reading Rubrics from Text PDFs (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/107">#107</a>)</summary>

**Added**
- Rubrics can be read from PDFs that have real text, one table per page, in any of the layouts the app reads. A scanned PDF has no text to read, so it is still saved as a file.

**Changed**
- A rating scale with one entry that gives no points, such as "U. Unsatisfactory", is now read without that entry, with a warning at review, rather than not read at all.

</details>

<a id="v2.49.0"></a>
<details>
<summary><strong>v2.49.0</strong> · 2026-11-15 · Shared Scales, Mark Ranges and Allotted Marks in Rubric Files</summary>

**Added**
- Rubric files in three more layouts can be read into a grid: a rating scale beside the criteria, such as "5. Excellent"; levels beside mark ranges, such as "8-10 marks", worth the top of each range; and a list of criteria with their allotted marks and no levels.
- The review warns when mark ranges overlap or leave gaps, or a Total row doesn't match the criteria.

**Changed**
- A column of one student's marks, and form fields such as "Name: …", are never read into a rubric or offered as its title.
- A table whose level cells are all numbers, such as a mark sheet, is no longer read as a rubric.

</details>

<a id="v2.48.0"></a>
<details>
<summary><strong>v2.48.0</strong> · 2026-11-06 · Grid-Only Rubric Files and Several Rubrics per File (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/106">#106</a>)</summary>

**Added**
- A rubric file can hold several rubrics. The app lists each one it finds, and the teacher ticks the ones to keep and chooses each title: the heading in the file, the file's name, or their own.
- A criterion can have no levels. It is then marked out of its maximum points only.
- A teacher can delete a rubric they uploaded, even when only its grid was kept.

**Changed**
- When the app reads a grid from an uploaded file, only the reviewed grid is saved, and the file itself is no longer stored. A file it can't read is still stored as before.
- A table where no level has points, such as a mark sheet, is no longer read as a rubric.
- Replacing a rubric's file with one the app can read replaces its grid and removes the stored file.

**Deploy notes**
- The Firestore rules for this change were deployed on 2026-11-06, before merging (`firebase deploy --only firestore:rules`). No indexes, scripts or environment variables.

</details>

<a id="v2.47.0"></a>
<details>
<summary><strong>v2.47.0</strong> · 2026-11-06 · Rubrics List Filter, Page Tour and Student Help (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/105">#105</a>)</summary>

**Added**
- The Rubrics page has a search box for titles and descriptions, and a filter by type: grid, grid with a file, or file only.
- A Take a tour button on the Rubrics page walks through uploading, templates, reviewing a grid and the row actions. A read-only account sees only the parts about viewing.
- Students and parents see a short note on an assignment's rubric explaining how to move through it and keep a copy.

</details>

<a id="v2.46.0"></a>
<details>
<summary><strong>v2.46.0</strong> · 2026-11-05 · Reading Rubric Files into a Grid, and Rubric Templates (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/104">#104</a>)</summary>

**Added**
- When a rubric file is uploaded as an Excel, CSV, Word or Markdown file in the template's layout, the app reads its criteria into a grid. The teacher checks and corrects the grid before saving, or saves the file alone. Files in other layouts, and PDFs, are still saved as files only.
- A Download Template button on the Rubrics page gives a rubric template in Excel, CSV, Word or Markdown, with help on how to fill it in.
- Replacing or attaching a rubric file can also replace the rubric's grid, after a review. Otherwise the grid stays as it is.

</details>

<a id="v2.45.1"></a>
<details>
<summary><strong>v2.45.1</strong> · 2026-11-05 · Confirmation Before Saving a Rubric File (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/103">#103</a>)</summary>

**Security**
- Before a rubric file is saved, the person must tick a box saying it holds no student names, marks or answer keys, because students and parents can download the whole file.
- An Excel file with more than one sheet, or a hidden one, now lists its sheets before it is saved, since everyone who downloads it gets them all.

**Deploy notes**
- No Firebase rules or indexes to deploy, no scripts to run and no new environment variables.
- Files uploaded before this version were not checked.

</details>

<a id="v2.45.0"></a>
<details>
<summary><strong>v2.45.0</strong> · 2026-11-04 · Rubric File Uploads, Downloads and a Criteria Carousel (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/102">#102</a>)</summary>

**Added**
- Administrators and teachers can upload a rubric as an Excel, CSV, Word, PDF or Markdown file of up to 500 KB. Old file types, files with macros and CSV files with formulas are refused, and an Excel file with formulas gets a warning.
- Rubrics can be downloaded as the original file, or as PDF, Excel, Word or Markdown. Students and parents download from the assignment page. Read-only accounts can view a rubric but not download it.

**Changed**
- A rubric now shows one criterion at a time, in its view window and on the assignment page, with arrows, a list of criteria, arrow keys and swipe on phones and tablets.
- Only the person who uploaded a rubric's file, or an administrator, can replace or remove it. A teacher can delete a rubric they created if it holds their own file.

**Fixed**
- The Rubrics page no longer appears for platform administrators, where it never finished loading.

**Security**
- The database rules now limit a rubric's size, stop anyone changing who created it, and refuse a rubric's stored file to read-only accounts.

**Deploy notes**
- Already deployed on 2026-11-04, before this merge: `firebase deploy --only firestore:rules` and `firebase deploy --only firestore:indexes`. Deploy them again only if `firestore.rules` or `firestore.indexes.json` change before merging.
- No scripts to run and no new environment variables.

</details>

<a id="v2.44.0"></a>
<details>
<summary><strong>v2.44.0</strong> · 2026-11-04 · Fixed Attendance Register Documents, Per-Student Saving, and Duplicate and Migration Scripts (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/101">#101</a>)</summary>

**Added**
- A read-only report of duplicate attendance registers, gradebook results and feedback comments, for administrators.
- A script that moves existing attendance registers to their new fixed ids, one institution at a time.

**Changed**
- Each attendance register now has one fixed document, so saving the same register twice can no longer create a second copy. Spreadsheet imports follow the same rule.
- A register save now changes only the students it touched, so marks another teacher saved in the meantime stay. If two people change the same student, the last save still wins.

**Fixed**
- Removing a school day from a time block is now refused when a subject register falls on that day, as it already was for general registers.

**Deploy notes**
- No Firebase rules or indexes to deploy. Existing registers keep working at their old ids until they are moved.
- After deploying, outside school hours, run `node scripts/migrate-register-ids.mjs --key=<path> --institution=<id>` to preview, then add `--live`. Seeded registers already have fixed ids.
- A day or so later, run `node scripts/find-duplicate-records.mjs --key=<path> --institution=<id> --read` to catch registers created by tabs still on the old build.

</details>

<a id="v2.43.4"></a>
<details>
<summary><strong>v2.43.4</strong> · 2026-11-04 · Subject Register and Gradebook Comment Dates Stay Correct, and Rule Tests for Offline Saving (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/100">#100</a>)</summary>

**Fixed**
- Editing a subject attendance register no longer deletes the date it was first created.
- Saving comments in the gradebook no longer changes the date they were first written. The Feedback list keeps the original date, and Grade Entry Tracking no longer counts a comment in a later period just because it was edited.

**Deploy notes**
- Nothing to deploy. Past data isn't repaired: registers already edited stay without a created date, and comments keep the date of their last gradebook save.

</details>

<a id="v2.43.3"></a>
<details>
<summary><strong>v2.43.3</strong> · 2026-11-04 · New Accounts Appear in Lists Without a Reload (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/99">#99</a>)</summary>

**Fixed**
- New students, teachers and parents now appear in their lists straight away, without reloading the page. This covers accounts created by form, by converting a registration, or by student import.
- A class's student list also picks up new students straight away.

**Deploy notes**
- Nothing to deploy.

</details>

<a id="v2.43.2"></a>
<details>
<summary><strong>v2.43.2</strong> · 2026-11-04 · Unused Code Removal, Finished Script Deletion, Shared Script Helper and Backlog (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/98">#98</a>)</summary>

**Changed**
- Unused code was removed from the app. Nothing changes for users.

**Removed**
- Eight finished one-time admin scripts and two npm commands are gone: `npm run migrate` and `npm run backfill:department-ids`.

**Deploy notes**
- Nothing to deploy. The removed scripts remain in git history: `backfill-assignment-fields`, `migrate-lesson-note-files`, `backfill-department-ids`, `backfill-nanp-phone-format`, `backfill-registration-directory`, `migrate-to-institutions`, `backfill-student-class-ids` and `backfill-has-photo`.

</details>

<a id="v2.43.1"></a>
<details>
<summary><strong>v2.43.1</strong> · 2026-11-04 · Code Quality Checks with Fallow and Formatting Commands with Prettier (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/97">#97</a>)</summary>

**Added**
- Developers and coding agents now have a code-quality check that reports new dead code, duplication and complexity on their changes. It only reports and never blocks a merge.
- There are new commands to apply the same code formatting that the editor applies on save.

**Deploy notes**
- Nothing to deploy. The new `.github/workflows/fallow.yml` runs on pull requests that change `sms-system/`.

</details>

<a id="v2.43.0"></a>
<details>
<summary><strong>v2.43.0</strong> · 2026-11-03 · Parents read only their children's classes' lesson-note files (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/96">#96</a>)</summary>

**Security**
- A parent can now open only the lesson-note files of their children's classes, including any additional classes. Before, a parent who wrote their own query could read any class's files.

**Added**
- Each parent's account now keeps a list of their children's classes, which updates when a link or a child's classes change. Owners have a new script that fills in and repairs these lists.

**Changed**
- A parent refused a file is told it is for a class their child isn't in and to contact the school.

**Deploy notes**
- Do not deploy the rules until the script has run: a parent with no list is refused every file.
- After the merge and the Vercel deploy, run `node scripts/sync-parent-linked-classes.mjs --key=<path>`, then again with `--live`, then once more to confirm nothing is left to change.
- Then run `firebase deploy --only firestore:rules` and `npx playwright test e2e/09-lesson-notes.spec.ts`.

</details>

<a id="v2.42.1"></a>
<details>
<summary><strong>v2.42.1</strong> · 2026-11-03 · Students read only their own classes' lesson-note files (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/95">#95</a>)</summary>

**Security**
- A student can now open only the lesson-note files of their own classes, including any additional classes. Before, a student who wrote their own query could read another class's files.

**Changed**
- A student refused a file is told it is for another class and to ask their teacher. Download all skips that file and carries on.

**Deploy notes**
- `firebase deploy --only firestore:rules` was run on 2026-11-03, before the merge. Run it again only if the rules were rolled back.

</details>

<a id="v2.42.0"></a>
<details>
<summary><strong>v2.42.0</strong> · 2026-11-03 · Download all, monthly download limits and kill switches (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/94">#94</a>)</summary>

**Added**
- On a computer, a lesson note with two or more files has Download all, which saves one zip. It shows progress and can be stopped, with a choice to keep what was fetched.
- Files already downloaded are kept on the device until sign-out, so downloading them again uses none of the monthly allowance. A note can't be fetched in full twice: the button offers only what is missing, then Save again from this device.
- Download all stops at monthly limits, and large-file downloads stop at a higher limit, so the free allowance is not used up.
- Owners can pause large-file downloads or new large uploads for everyone with a script.

**Fixed**
- A large download with no connection now fails with a message instead of waiting for good.

**Deploy notes**
- Run `firebase deploy --only database --project school-sms-v1` before the merge. It was run on 2026-11-03.
- Set `VITE_SEQUENTIAL_DOWNLOADS=true` for Vercel Preview only. Download all stays off on phones and tablets in production until it has been tested on real devices; then set the variable for Production and redeploy.
- New script: `scripts/set-large-files-paused.mjs`, a dry run unless `--apply` is given.

</details>

<a id="v2.41.0"></a>
<details>
<summary><strong>v2.41.0</strong> · 2026-11-03 · Lesson notes with up to 12 files (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/93">#93</a>)</summary>

**Added**
- A lesson note can have up to 12 files instead of 5. The 15 MB total and the 5 MB limit per file stay the same.
- The lesson note form shows how much of the 15 MB is used, and progress while large files upload.
- The form warns when a school has used 80% of its large-file storage.

**Changed**
- Choosing more files than fit now adds what fits and names the rest.
- A note that would overfill the school's large-file storage is refused before anything uploads.

**Fixed**
- Removing several large files at once could leave some behind, using up storage until the clean-up script ran.
- The overall large-file limit could allow more than the free Realtime Database holds. It is now 700 MB, about 933 MB once stored.

**Deploy notes**
- Check the counters first with `node scripts/sweep-orphan-blobs.mjs --key=<path> --project=<id>`, and stop if the total is above 700,000,000.
- Run `npm run firebase:deploy:rules` and `firebase deploy --only database --project school-sms-v1` before the merge. Both were run on 2026-11-03. Do not put the file limit in the rules back to 5 once a note has more files.

</details>

<a id="v2.40.0"></a>
<details>
<summary><strong>v2.40.0</strong> · 2026-11-01 · Public page footer (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/91">#91</a>)</summary>

**Added**
- The sign-in and registration pages have a footer with the copyright, the app version, a "Try the demo" link to the public demo and a "Designed by GENR8-3D" credit.

**Changed**
- The version on the sign-in screens moved into this footer, which stays at the bottom of the screen and no longer covers the sign-in card on short screens.

**Deploy notes**
- None: no Firebase deploy, script or environment variable.

</details>

<a id="v2.39.0"></a>
<details>
<summary><strong>v2.39.0</strong> · 2026-11-01 · Version tracking and changelog (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/90">#90</a>)</summary>

**Added**
- The app shows its version at the bottom of the sidebar and on the sign-in screens, and Settings has an About panel with the version, build and environment.
- Error screens and console error reports name the version, so a screenshot or a copied log says which build it came from.
- This changelog, a version policy (`sms-system/docs/VERSIONING.md`), `npm run version:bump`, `version:check` and `version:extract`, and a test that keeps `package.json`, `package-lock.json` and this file in step.
- Every merge to `main` is tagged `vX.Y.Z` and gets a GitHub Release by a workflow; a pull-request check says when shipped code changed without a new version, and when a title does not start with `SMS-<number> | `.
- Earlier versions are recorded back to v0.0.1, with a script that creates their git tags.

**Deploy notes**
- None: no Firebase deploy, script or environment variable. The retroactive tags were created and pushed on 2026-11-01.

</details>

<a id="v2.38.0"></a>
<details>
<summary><strong>v2.38.0</strong> · 2026-10-30 · Institution delete and QA setup scripts (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/89">#89</a>)</summary>

**Added**
- A guarded script that deletes one institution and all of its data (Firestore, sign-in accounts and Realtime Database files), dry run by default, resumable under the daily quota.
- A script that sets up the QA institution the end-to-end tests run against.

**Changed**
- The end-to-end tests read the QA institution, names and addresses from `.env.qa` instead of having them written into the specs, and moved to a new QA institution.

**Fixed**
- The orphaned-file sweep corrects the usage counters and exits when it finishes.

</details>

<a id="v2.37.0"></a>
<details>
<summary><strong>v2.37.0</strong> · 2026-10-27 · Question pictures, exam activity log, supervision presets and phone layout (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/88">#88</a>)</summary>

**Added**
- Exam questions can have a picture, added in the builder or imported from Word, PDF, Markdown and Google Forms printouts.
- The teacher sees when a student left the exam page during an attempt.
- A teacher chooses how an exam is supervised: unsupervised exams ask for fullscreen, mark the paper and can turn off copying; any exam can be set to be answered in order only.
- On a phone, the exam shows one question at a time with swiping, a Questions sheet, and the timer always in view; the builder and results pages are laid out for phones too.
- The exam builder asks before leaving with unsaved changes.

**Changed**
- Exam dates and times read like "3:00 PM on April 14, 2026", in Jamaica time.
- Submit waits until every question is answered and says when time is up.

**Deploy notes**
- Deploy `firestore.rules` and `firestore.indexes.json`.

</details>

<a id="v2.36.0"></a>
<details>
<summary><strong>v2.36.0</strong> · 2026-10-22 · Online multiple-choice exams and lesson notes for several classes (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/87">#87</a>)</summary>

**Added**
- Online multiple-choice exams: teachers build them by hand or import them from a spreadsheet, Word or PDF file and preview them as a student; students sit them against the server clock; staff grade, release and finalize them, add extra time, and the scores reach the report cards.
- Students and parents see their exams and results.
- A lesson note can be for several classes and several subjects.

**Deploy notes**
- Deploy `firestore.rules` and `firestore.indexes.json`. The rules now have emulator tests (`npm run test:rules`).

</details>

<a id="v2.35.0"></a>
<details>
<summary><strong>v2.35.0</strong> · 2026-10-20 · Additional classes, stored head-counts, faster loading and error reporting (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/86">#86</a>)</summary>

**Added**
- A student can belong to additional classes, with all subjects or chosen subjects in each, and sees the timetable, lesson notes and assignments of every class they are in.
- Class and house lists show each one's Male/Female head-count.
- A failed load now says why in a plain-language message instead of leaving the page empty or loading forever, and a broken dashboard card is contained to its own box.
- Scripts to rename an institution and to check the sign-in email template.

**Changed**
- Pages load on demand, so the first download is much smaller; a tab left open across a deploy reloads itself.
- A failed sign-in says why instead of always "Incorrect password".

**Security**
- The site sends security headers, with a report-only Content Security Policy.

**Fixed**
- Several lists and dialogs read data without filtering on the institution, which the rules refused.

**Deploy notes**
- Deploy `firestore.rules` and `firestore.indexes.json`. Run `backfill-student-class-ids.mjs`, then `recount-class-populations.mjs`; run `backfill-has-photo.mjs` and `rotate-spectator-default-passwords.mjs` after the deploy.

</details>

<a id="v2.34.0"></a>
<details>
<summary><strong>v2.34.0</strong> · 2026-10-15 · Demo institution seed, Feedback page fixes and fewer reads (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/85">#85</a>)</summary>

**Added**
- Scripts that seed a demo primary school (with rubrics, results, discipline and report cards), reset the QA admin's password and clear the demo spectator's activity log.

**Fixed**
- The Feedback page no longer crashes or shows "Invalid Date", and a page that fails to render shows a message inside the dashboard instead of a blank app.
- The Feedback list and Grade-Entry Tracking read fewer documents.

</details>

<a id="v2.33.0"></a>
<details>
<summary><strong>v2.33.0</strong> · 2026-10-13 · List filters, natural ordering and result counts (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/84">#84</a>)</summary>

**Added**
- The people and setup lists have dropdown filters, sort names with numbers in natural order, and show how many rows match.

**Changed**
- The profile page's columns line up and Activity uses the full width.

**Fixed**
- Every house shows while class data is still loading.

</details>

<a id="v2.32.0"></a>
<details>
<summary><strong>v2.32.0</strong> · 2026-10-13 · Sign-in link status, audited sign-in emails and offline banner (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/83">#83</a>)</summary>

**Added**
- Admins see whether each account's sign-in link was sent and used; sending one is recorded in the audit log.
- A banner says when the app is offline.

**Removed**
- Dashboard cards that showed placeholder data.

**Deploy notes**
- Deploy `firestore.rules`.

</details>

<a id="v2.31.0"></a>
<details>
<summary><strong>v2.31.0</strong> · 2026-10-13 · Optional assistant teacher on subjects (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/82">#82</a>)</summary>

**Added**
- A subject can have an assistant teacher besides its lead teacher; gradebooks name the lead teacher.

**Fixed**
- Deleting a user re-reads the subjects first, so a subject is not left pointing at a deleted teacher.

</details>

<a id="v2.30.0"></a>
<details>
<summary><strong>v2.30.0</strong> · 2026-10-10 · Class population and house class columns (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/81">#81</a>)</summary>

**Added**
- The Classes list shows each class's population and the Houses list shows each house's classes, without reading every user.

**Fixed**
- House counts stay current, and detail pages match their lists.

</details>

<a id="v2.29.0"></a>
<details>
<summary><strong>v2.29.0</strong> · 2026-10-10 · In-memory Firestore cache and counted dashboards (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/80">#80</a>)</summary>

**Changed**
- Dashboard user counts use aggregation queries instead of listening to every user document.

**Security**
- Firestore data is no longer kept in the browser after sign-out.

</details>

<a id="v2.28.0"></a>
<details>
<summary><strong>v2.28.0</strong> · 2026-10-10 · Schedule without a term picker for students and parents (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/79">#79</a>)</summary>

**Changed**
- Students and parents see the current timetable without choosing a term, served from the shared timetable cache.

</details>

<a id="v2.27.1"></a>
<details>
<summary><strong>v2.27.1</strong> · 2026-10-09 · Missing profile photo fix</summary>

**Fixed**
- Deleting a teacher who has no photo works, and the Students and Teachers lists no longer log permission errors for rows without a photo.

</details>

<a id="v2.27.0"></a>
<details>
<summary><strong>v2.27.0</strong> · 2026-10-09 · Admins can delete student and teacher accounts (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/78">#78</a>)</summary>

**Added**
- Institution admins can delete a student or teacher account and the records that belong to it.
- A script that removes sign-in accounts left without a user record.

**Deploy notes**
- Deploy `firestore.rules`.

</details>

<a id="v2.26.0"></a>
<details>
<summary><strong>v2.26.0</strong> · 2026-10-09 · Stale subject enrollments and admins as teachers (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/77">#77</a>)</summary>

**Added**
- An institution admin can also be a subject's teacher.
- Scripts to remove stale subject enrollments and to fix an account's sign-in address.

**Fixed**
- Students moved out of a class are removed from its subjects.

</details>

<a id="v2.25.0"></a>
<details>
<summary><strong>v2.25.0</strong> · 2026-10-09 · Several files per lesson note and optional links (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/76">#76</a>)</summary>

**Added**
- A lesson note can have up to five files and optional links, under a three-line header.
- The email settings show a logo, and a failed send shows EmailJS's error code.

**Deploy notes**
- Deploy `firestore.rules` first (they accept both shapes), then run `migrate-lesson-note-files.mjs`.

</details>

<a id="v2.24.0"></a>
<details>
<summary><strong>v2.24.0</strong> · 2026-10-09 · First sign-in links by email (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/75">#75</a>)</summary>

**Added**
- Admins can email a new account its first sign-in link through the institution's own EmailJS account.

**Deploy notes**
- Set `VITE_EMAIL_ENABLED` and `VITE_APP_URL`, and deploy `firestore.rules`.

</details>

<a id="v2.23.0"></a>
<details>
<summary><strong>v2.23.0</strong> · 2026-10-09 · 5 MB attachments for lesson notes and assignments (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/74">#74</a>)</summary>

**Added**
- Teachers and admins can attach files up to 5 MB to lesson notes and assignments, stored in the Realtime Database.
- A script that sweeps orphaned attachment files.

**Deploy notes**
- Deploy `database.rules.json` and `firestore.rules`.

</details>

<a id="v2.22.0"></a>
<details>
<summary><strong>v2.22.0</strong> · 2026-10-09 · Read-only spectator role (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/73">#73</a>)</summary>

**Added**
- A spectator role that sees what an institution admin sees, read-only, with its own dashboard; admins create and manage spectator accounts.
- A "No access" page for an unrecognised role.
- Read-only scripts to count and clean up the seed institution and the old flat collections.

**Deploy notes**
- Deploy `firestore.rules`.

</details>

<a id="v2.21.0"></a>
<details>
<summary><strong>v2.21.0</strong> · 2026-10-03 · Collapsible sidebar groups and class, subject and term pages (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/72">#72</a>)</summary>

**Added**
- Detail pages for a class, a subject and a term, and fill tools for the attendance register.
- Sidebar groups can be collapsed; Reports and Administration have their own groups, and the group holding the current page opens.

**Fixed**
- The mobile menu closes when Start Tour is pressed, and a class page refreshes its students after an edit.

</details>

<a id="v2.20.0"></a>
<details>
<summary><strong>v2.20.0</strong> · 2026-10-02 · Audit log and activity log (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/71">#71</a>)</summary>

**Added**
- Admin actions on other accounts and teachers' saves of attendance, grades, comments and notes are recorded in the audit log.
- The Audit Log page and the profile's activity sections are paged, and the profile has "Actions I performed".

**Deploy notes**
- Deploy `firestore.rules` and `firestore.indexes.json`.

</details>

<a id="v2.19.0"></a>
<details>
<summary><strong>v2.19.0</strong> · 2026-10-02 · Tab-scoped sign-in and one active session per account (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/70">#70</a>)</summary>

**Added**
- Closing the tab signs out, and an account can be signed in in only one place at a time; an admin can reset a stuck session.

**Removed**
- The placeholder "Active sessions" row in Settings.

**Deploy notes**
- Create the Realtime Database, set `VITE_FIREBASE_DATABASE_URL` and `VITE_SINGLE_SESSION_ENABLED`, and deploy `database.rules.json` and `firestore.rules`.

</details>

<a id="v2.18.0"></a>
<details>
<summary><strong>v2.18.0</strong> · 2026-10-02 · Class days on the calendar, favicon and login polish (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/69">#69</a>)</summary>

**Added**
- The student and parent calendar marks class days.
- A favicon set and touch icon.

**Changed**
- Login buttons are 44 px tall, and the default logo is smaller to download.

</details>

<a id="v2.17.0"></a>
<details>
<summary><strong>v2.17.0</strong> · 2026-10-02 · NANP phone formatting (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/68">#68</a>)</summary>

**Added**
- Phone numbers are formatted and checked as North American numbers, with a script that reformats stored ones.

**Deploy notes**
- Deploy `firestore.rules`, then run `backfill-nanp-phone-format.mjs`.

</details>

<a id="v2.16.0"></a>
<details>
<summary><strong>v2.16.0</strong> · 2026-10-02 · Student mobile layout and next-class card (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/67">#67</a>)</summary>

**Added**
- The student pages are laid out for phones first, with a next-class card, and Schedule and Lessons are redesigned for small screens.

**Changed**
- Attendance pages are wider and use long dates.

**Fixed**
- Attendance in custom-calendar institutions.

</details>

<a id="v2.15.0"></a>
<details>
<summary><strong>v2.15.0</strong> · 2026-10-01 · Lesson notes, required teacher departments and users lockdown (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/66">#66</a>)</summary>

**Added**
- Lesson Notes: teachers share notes with their classes, with dashboard shortcuts.
- Admins can deactivate and reactivate accounts.

**Changed**
- Every teacher needs a department, and the forms warn when one is missing.

**Security**
- Users can edit only a short list of their own fields, can no longer change their department, and log times are set by the server.

**Deploy notes**
- Order matters: deploy `firestore.indexes.json`, then the app, then `firestore.rules`. Rules deployed before the app refuse the old app's log writes.

</details>

<a id="v2.14.1"></a>
<details>
<summary><strong>v2.14.1</strong> · 2026-09-30 · Houses, attendance registers and rubrics follow-up (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/65">#65</a>)</summary>

**Added**
- The General Attendance register shows the student count and can auto-fill empty cells; rubrics have a read-only view.

**Fixed**
- House links, the Edit House flicker, attendance drafts lost on save, and rosters sorted by full name.

</details>

<a id="v2.14.0"></a>
<details>
<summary><strong>v2.14.0</strong> · 2026-09-29 · Assignments workflow (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/64">#64</a>)</summary>

**Added**
- Assignments have a detail page, student submissions and attempts, teacher grading with rubrics, and a button that sends grades to the gradebook.
- A script that trims submission attachments after four months.

**Deploy notes**
- Deploy `firestore.indexes.json` and `firestore.rules`, then run `backfill-assignment-fields.mjs`.

</details>

<a id="v2.13.0"></a>
<details>
<summary><strong>v2.13.0</strong> · 2026-09-27 · Role-default password reset script (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/63">#63</a>)</summary>

**Added**
- A script that resets existing accounts to their role's default temporary password.

</details>

<a id="v2.12.1"></a>
<details>
<summary><strong>v2.12.1</strong> · 2026-09-27 · Custom calendar follow-up and account security (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/62">#62</a>)</summary>

**Changed**
- Timetable slots can be on Saturday.

**Security**
- Every account an admin creates must change its password at first sign-in.

**Fixed**
- The calendar shows custom-mode time blocks and starts its week on Sunday, and stale login-directory entries repair themselves.

</details>

<a id="v2.12.0"></a>
<details>
<summary><strong>v2.12.0</strong> · 2026-09-27 · Custom calendar mode (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/61">#61</a>)</summary>

**Added**
- An institution can run on custom time blocks instead of terms, with programmes, repeat blocks and editable session days.

**Fixed**
- Term status values match between the forms and the data.

**Deploy notes**
- Deploy `firestore.rules`.

</details>

<a id="v2.11.0"></a>
<details>
<summary><strong>v2.11.0</strong> · 2026-09-23 · Cached Firestore reads and accessibility polish (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/60">#60</a>)</summary>

**Added**
- Toast messages and a countdown before the automatic sign-out.

**Changed**
- Lists and reference data are cached and shared between pages, so fewer documents are read.
- Icon buttons have labels for screen readers.

</details>

<a id="v2.10.0"></a>
<details>
<summary><strong>v2.10.0</strong> · 2026-09-22 · Photo upload (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/59">#59</a>)</summary>

**Added**
- Admins can upload, replace and remove student and teacher photos, and students can add one when registering; photos show in the lists, the profile and the header.

**Deploy notes**
- Deploy `firestore.rules`.

</details>

<a id="v2.9.0"></a>
<details>
<summary><strong>v2.9.0</strong> · 2026-09-22 · Students import, JSON files and forced password change (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/58">#58</a>)</summary>

**Added**
- Students can be imported from a spreadsheet, and imports accept JSON files.
- An account can be made to change its password at the next sign-in.

**Deploy notes**
- Deploy `firestore.indexes.json`.

</details>

<a id="v2.8.1"></a>
<details>
<summary><strong>v2.8.1</strong> · 2026-09-21 · Dependency updates (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/54">#54</a>–<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/57">#57</a>)</summary>

**Security**
- Updated vitest, hono, js-yaml and morgan.

</details>

<a id="v2.8.0"></a>
<details>
<summary><strong>v2.8.0</strong> · 2026-09-21 · Create Account, registration form and list page improvements (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/53">#53</a>)</summary>

**Added**
- Optional ID and phone fields on Create Account, and search and sort on the Teachers and Parents pages.

**Changed**
- The Student detail page and the Students list share one edit dialog.

**Fixed**
- Create Account errors and sign-in handling.

**Deploy notes**
- Deploy `firestore.rules`.

</details>

<a id="v2.7.1"></a>
<details>
<summary><strong>v2.7.1</strong> · 2026-09-21 · Bulk seed read cap (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/52">#52</a>)</summary>

**Fixed**
- The bulk seed caps its reads per run so it does not use up the daily Firestore quota.

</details>

<a id="v2.7.0"></a>
<details>
<summary><strong>v2.7.0</strong> · 2026-09-09 · Bulk seed and teardown for stress tests (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/51">#51</a>)</summary>

**Added**
- Scripts that fill a large dummy institution over several daily runs and remove it again.

</details>

<a id="v2.6.0"></a>
<details>
<summary><strong>v2.6.0</strong> · 2026-09-09 · Progress reports (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/50">#50</a>)</summary>

**Added**
- A Progress Reports page that generates progress reports and exports them to PDF.

**Deploy notes**
- Deploy `firestore.rules` and `firestore.indexes.json`.

</details>

<a id="v2.5.0"></a>
<details>
<summary><strong>v2.5.0</strong> · 2026-09-07 · Spreadsheet import (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/49">#49</a>)</summary>

**Added**
- Results, discipline records, gradebook scores and both attendance registers can be imported from CSV or XLSX files, with downloadable templates and a preview before committing.

</details>

<a id="v2.4.0"></a>
<details>
<summary><strong>v2.4.0</strong> · 2026-09-07 · Institution-gated login (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/48">#48</a>)</summary>

**Changed**
- Signing in starts by choosing the institution, and the account must belong to it.

**Deploy notes**
- Run `backfill-registration-directory.mjs` so existing institutions appear in the login list.

</details>

<a id="v2.3.0"></a>
<details>
<summary><strong>v2.3.0</strong> · 2026-09-06 · Export to CSV and spreadsheet (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/47">#47</a>)</summary>

**Added**
- The attendance gridsheet, results and report cards can be exported to CSV or XLSX.
- Results can be filtered by class, subject and term, and students and parents see only their own.

</details>

<a id="v2.2.0"></a>
<details>
<summary><strong>v2.2.0</strong> · 2026-09-06 · Attendance, academic calendar and filter improvements (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/46">#46</a>)</summary>

**Added**
- An app-wide current term, class and subject choices kept until sign-out, Save All and a Blank state in the attendance register, and grade-entry tracking by month or two months.
- Editable holiday dates and draft academic years in the calendar wizard.

**Changed**
- "Create User" is now "Create Account", and new subjects default to 40% coursework and 60% exam.

**Fixed**
- A stale dashboard briefly showing after sign-in, and several attendance and calendar save problems.

</details>

<a id="v2.1.0"></a>
<details>
<summary><strong>v2.1.0</strong> · 2026-09-06 · Student registration form (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/45">#45</a>)</summary>

**Added**
- Prospective students can register online for institutions that accept registrations; admins review them, see likely duplicates and turn them into accounts.
- Parents have a relationship label.

**Security**
- Firebase App Check protects the public registration form.

**Deploy notes**
- Set `VITE_FIREBASE_APPCHECK_SITE_KEY` and deploy `firestore.rules`.

</details>

<a id="v2.0.2"></a>
<details>
<summary><strong>v2.0.2</strong> · 2026-09-06 · Exam, assignment and report card fixes (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/44">#44</a>)</summary>

**Fixed**
- Report cards made before discipline records existed no longer show "undefined".
- Editing an exam or assignment without touching Subject keeps its names and teacher list.
- A confirmed exam clash no longer lets a different class or date through.

</details>

<a id="v2.0.1"></a>
<details>
<summary><strong>v2.0.1</strong> · 2026-08-14 · Dependency updates (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/35">#35</a>–<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/43">#43</a>)</summary>

**Security**
- Updated react-router, undici, hono, re2, js-yaml, ip-address, fast-uri and fast-xml-parser.

</details>

<a id="v2.0.0"></a>
<details>
<summary><strong>v2.0.0</strong> · 2026-08-03 · Data nested under each institution, Firebase CLI (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/34">#34</a>)</summary>

**Breaking**
- Each institution's data moved from shared top-level collections to `institutions/{id}/...`. Data written by v1 is not read by v2 until it is migrated, and the v1 app cannot use the new rules.

**Added**
- `firestore.rules` and `firestore.indexes.json` are kept in the repository and deployed with the Firebase CLI.
- The "+" buttons on the Teachers, Students and Parents pages open Create Account with that role chosen; the exam and assignment dialogs load their choices live.

**Fixed**
- A timetable slot with missing fields no longer crashes the Schedule page.

**Deploy notes**
- Back up, run `migrate-to-institutions.mjs` and `backfill-department-ids.mjs`, then deploy the rules and indexes.

</details>

## 1.x — live product on shared collections (2026-06-02 to 2026-07-24)

<a id="v1.10.1"></a>
<details>
<summary><strong>v1.10.1</strong> · 2026-07-24 · Dependency updates (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/31">#31</a>–<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/33">#33</a>)</summary>

**Security**
- Updated postcss, @tailwindcss/postcss, brace-expansion and websocket-driver.

</details>

<a id="v1.10.0"></a>
<details>
<summary><strong>v1.10.0</strong> · 2026-07-24 · Disciplinary actions (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/30">#30</a>)</summary>

**Added**
- Merits, demerits, detentions and suspensions are recorded on a Disciplinary Actions page and the student page, and counted on report cards.

</details>

<a id="v1.9.0"></a>
<details>
<summary><strong>v1.9.0</strong> · 2026-07-24 · Personalised preset comments (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/29">#29</a>)</summary>

**Changed**
- Preset feedback comments use the student's pronouns and the subject's name.

</details>

<a id="v1.8.1"></a>
<details>
<summary><strong>v1.8.1</strong> · 2026-07-03 · People page fixes (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/27">#27</a>)</summary>

**Fixed**
- The edit dialogs for parents, students and teachers drop fields that were not used, teachers' subjects and classes can be edited, and the teacher view link works.

</details>

<a id="v1.8.0"></a>
<details>
<summary><strong>v1.8.0</strong> · 2026-07-02 · Gradebook tour (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/26">#26</a>)</summary>

**Added**
- A guided tour of the gradebook, and page-level "Take a tour" buttons collapse the sidebar.

**Fixed**
- Opening a page's address directly on the hosted site works.

</details>

<a id="v1.7.1"></a>
<details>
<summary><strong>v1.7.1</strong> · 2026-07-01 · Documentation reorganised (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/25">#25</a>)</summary>

**Changed**
- The project documents are grouped into topic folders.

</details>

<a id="v1.7.0"></a>
<details>
<summary><strong>v1.7.0</strong> · 2026-06-30 · More tours (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/24">#24</a>)</summary>

**Added**
- Tour steps that depend on the role, and short tours for the gradebook and the report builder.

**Fixed**
- The tour spotlight drifting and cards going off-screen, including in dark mode.

</details>

<a id="v1.6.0"></a>
<details>
<summary><strong>v1.6.0</strong> · 2026-06-29 · Gradebook (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/23">#23</a>)</summary>

**Added**
- An editable grade grid for each class, subject and term.

</details>

<a id="v1.5.0"></a>
<details>
<summary><strong>v1.5.0</strong> · 2026-06-26 · Grade-entry tracking (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/22">#22</a>)</summary>

**Added**
- Admins can see which teachers have entered grades.

</details>

<a id="v1.4.0"></a>
<details>
<summary><strong>v1.4.0</strong> · 2026-06-25 · Walkthrough tour (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/21">#21</a>)</summary>

**Added**
- A guided walkthrough for institution admins that starts on first sign-in and from a Start Tour button.

</details>

<a id="v1.3.0"></a>
<details>
<summary><strong>v1.3.0</strong> · 2026-06-24 · Report builder (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/20">#20</a>)</summary>

**Added**
- A configurable report builder for analytics.

</details>

<a id="v1.2.0"></a>
<details>
<summary><strong>v1.2.0</strong> · 2026-06-22 · Updated interface (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/19">#19</a>)</summary>

**Changed**
- New icons and an updated look across the app.

</details>

<a id="v1.1.1"></a>
<details>
<summary><strong>v1.1.1</strong> · 2026-06-21 · Updated project technology (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/18">#18</a>)</summary>

**Changed**
- Libraries and build tools updated to their current versions, and remaining files moved to TypeScript.

</details>

<a id="v1.1.0"></a>
<details>
<summary><strong>v1.1.0</strong> · 2026-06-18 · Post-MVP additions (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/17">#17</a>)</summary>

**Added**
- Report Cards (replacing Reports), an Attendance Summary Register with PDF export, a timetable calendar, live dashboard charts, student gender, and loading placeholders on every list.
- A user guide for every role.

**Changed**
- Brand theming and many interface improvements; light mode is the default.

**Fixed**
- Production builds always use live data, and many bugs found in a demo run.

</details>

<a id="v1.0.0"></a>
<details>
<summary><strong>v1.0.0</strong> · 2026-06-02 · MVP: live Firestore data (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/16">#16</a>)</summary>

**Added**
- Every dashboard and list reads and writes live Firestore data.
- A two-step wizard that creates an institution and its admin.
- Schedule management with teacher-clash checks and delegated access for senior teachers.
- Deleting records from the edit dialogs.

**Security**
- Scores cannot exceed the maximum, and institutions are readable only by their own users and the super admin.

**Deploy notes**
- Set the `VITE_FIREBASE_*` variables (see `.env.example`).

</details>

## 0.x — development (2024-12-05 to 2026-05-22)

<a id="v0.4.0"></a>
<details>
<summary><strong>v0.4.0</strong> · 2026-05-22 · Super admin dashboard (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/15">#15</a>)</summary>

**Added**
- The super admin dashboard shows platform figures, an institutions table and charts.

</details>

<a id="v0.3.1"></a>
<details>
<summary><strong>v0.3.1</strong> · 2026-05-20 · Relative sizing (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/14">#14</a>)</summary>

**Changed**
- The dashboard uses relative sizes so it scales with the screen and text size.

</details>

<a id="v0.3.0"></a>
<details>
<summary><strong>v0.3.0</strong> · 2026-05-19 · Create user (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/13">#13</a>)</summary>

**Added**
- The super admin can create user accounts.

</details>

<a id="v0.2.0"></a>
<details>
<summary><strong>v0.2.0</strong> · 2026-05-18 · Data types and first security rules (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/12">#12</a>)</summary>

**Added**
- TypeScript types for the stored data, the teacher type in the signed-in session, and the first Firestore security rules.

</details>

<a id="v0.1.0"></a>
<details>
<summary><strong>v0.1.0</strong> · 2026-05-14 · Firebase sign-in (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/11">#11</a>)</summary>

**Added**
- Real sign-in with Firebase Authentication replaces the mock session, and the header shows the signed-in role.

</details>

<a id="v0.0.12"></a>
<details>
<summary><strong>v0.0.12</strong> · 2026-05-14 · Five-role session schema (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/10">#10</a>)</summary>

**Changed**
- The session uses the five roles of the specification, and the list pages check those roles.
- Firebase was added (after a Supabase trial).

</details>

<a id="v0.0.11"></a>
<details>
<summary><strong>v0.0.11</strong> · 2026-01-30 · Chart clean-up (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/9">#9</a>)</summary>

**Fixed**
- Unused code removed from the charts.

</details>

<a id="v0.0.10"></a>
<details>
<summary><strong>v0.0.10</strong> · 2026-01-30 · Profile and settings pages (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/8">#8</a>)</summary>

**Added**
- Profile and Settings pages that depend on the role.

</details>

<a id="v0.0.9"></a>
<details>
<summary><strong>v0.0.9</strong> · 2026-01-30 · Login clean-up (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/7">#7</a>)</summary>

**Changed**
- The role selector was removed from the login page, and its inputs are easier to read.

</details>

<a id="v0.0.8"></a>
<details>
<summary><strong>v0.0.8</strong> · 2025-11-16 · Dark sidebar fix (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/6">#6</a>)</summary>

**Fixed**
- The sidebar follows the dark theme.

</details>

<a id="v0.0.7"></a>
<details>
<summary><strong>v0.0.7</strong> · 2025-11-15 · Dependency updates (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/5">#5</a>)</summary>

**Security**
- Dependencies updated to fix known vulnerabilities.

</details>

<a id="v0.0.6"></a>
<details>
<summary><strong>v0.0.6</strong> · 2025-10-25 · Dark mode and dashboard layout (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/4">#4</a>)</summary>

**Added**
- Dark mode, a 12-column dashboard grid, and keyboard-friendly menu highlighting.

</details>

<a id="v0.0.5"></a>
<details>
<summary><strong>v0.0.5</strong> · 2025-10-24 · Protected routes and logout (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/3">#3</a>)</summary>

**Added**
- Dashboard pages require sign-in, and there is a logout button.

</details>

<a id="v0.0.4"></a>
<details>
<summary><strong>v0.0.4</strong> · 2025-10-24 · Login page (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/2">#2</a>)</summary>

**Added**
- A login page that stores the chosen role.

</details>

<a id="v0.0.3"></a>
<details>
<summary><strong>v0.0.3</strong> · 2025-10-13 · Dependency updates (<a href="https://github.com/SMSSystem/School-Management-Dashboard/pull/1">#1</a>)</summary>

**Security**
- Dependencies updated to fix known vulnerabilities, and the browser tab has the app's name.

</details>

<a id="v0.0.2"></a>
<details>
<summary><strong>v0.0.2</strong> · 2025-01-04 · Minor changes</summary>

**Changed**
- Small interface adjustments.

</details>

<a id="v0.0.1"></a>
<details>
<summary><strong>v0.0.1</strong> · 2024-12-05 · Dashboard prototype</summary>

**Added**
- The first complete dashboard: every list page and role dashboard, built in React and TypeScript with sample data.

</details>
