# Changelog

All notable changes to the School Management System, newest first. Versions follow [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) as this project applies it in [sms-system/docs/VERSIONING.md](sms-system/docs/VERSIONING.md); the layout is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Click a version to open it. Versions before v2.39.0 were recorded after the fact from the git history, one per pull request merged into `main`.

**Current version:** v2.42.1 · **Last updated:** 2026-11-03

## Unreleased

_Nothing yet._

## 2.x — data nested under each institution (2026-08-03 onward)

<a id="v2.42.1"></a>
<details open>
<summary><strong>v2.42.1</strong> · 2026-11-03 · Students Read Only Their Own Classes' Lesson-Note Files</summary>

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
