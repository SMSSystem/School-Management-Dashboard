# Legal and Privacy Compliance Guide

> **Status:** Research and drafting aid. Written 2026-10-03 on branch `email-feat-investigation`. **This is not legal advice.** It collects what the app does with personal data, what Jamaican law and the app's service providers say about it, and what the Privacy Notice, Terms of Service and Disclaimer pop-up should contain, with draft wording for a lawyer to review and adapt. Nothing here has been reviewed by a lawyer or by the Office of the Information Commissioner.
> **Scope:** Jamaican institutions (private and public schools) only. Other countries' laws appear only in a short note (§5.10).
> **Operator:** Not yet named. Every draft uses placeholders (listed in §12.1).
> **Decision recorded (2026-10-03):** the platform is treated as the **sole data controller** for the personal data the app processes (§4). This is the project owner's choice, not a legal conclusion; §4.3 explains the risk and the fallback.
> **How to read it:** §2 is the one-page summary. §3 is the facts about the app. §5 and §6 are the law and the providers. §7 to §9 are the three documents (with draft text). §10 to §11 are what to do. §12 lists what you must still decide or supply. Items marked **⚠ Verify** rest on secondary sources or on pages that could not be fully read.
> **Related:** `docs/miscellaneous-specs/EMAIL_INTEGRATION_SPEC.md` (§12 there is the email-specific part of this guide), `docs/firebase/firebase-rules.md`, `docs/miscellaneous-specs/AUDIT_LOG_ACCOUNT_ACTIONS_SPEC.md`.

---

## Contents

1. Purpose and limits of this guide
2. Executive summary
3. The app at a glance (facts)
4. Roles under the law: who is the controller
5. Jamaican law
6. Provider policies: Firebase/Google, Vercel, EmailJS, SMTP2GO
7. The Disclaimer pop-up (behaviour and draft text)
8. The Privacy Notice (structure and draft text)
9. The Terms of Service (structure and draft text)
10. Operations: checklists, playbooks, retention, records
11. Gaps in the app and recommended changes
12. Open questions and placeholders
13. Glossary
14. Appendices: draft texts and sources

---

## 1. Purpose and limits of this guide

- **What it is for.** To let the project owner (a) understand the legal and contractual position of the app before real student and staff data is processed, (b) write three public documents (Privacy Notice, Terms of Service, Disclaimer pop-up) that match what the app actually does, and (c) build the technical and operational controls those documents promise.
- **What it is not.** Legal advice, a certification of compliance, or a substitute for a Jamaican attorney and, where useful, the Office of the Information Commissioner (OIC). The Jamaican Data Protection Act, 2020 (the Act) was researched through law-firm and regulator summaries because the official PDF on `japarliament.gov.jm` could not be read by the tool used; section numbers are given only where several sources agree. Read the Act and the OIC's guidance before relying on any detail.
- **Providers' documents.** EmailJS's Terms, Privacy Policy and nFADP page were supplied by the project owner as printed web pages (`internal/regarding-emailjs/policies/`); a few lines are cut at page boundaries. Firebase/Google, Vercel and SMTP2GO pages were read online on 2026-10-03; several `support.smtp2go.com` pages returned errors and were reconstructed from SMTP2GO's blog and search snippets. Providers change their terms; re-read them before launch and again at least yearly.
- **Wording convention.** "Must" means a requirement found in a source; "should" is a recommendation of this guide; "⚠ Verify" marks claims to confirm.

---

## 2. Executive summary

### 2.1 What the app is, in legal terms

A multi-institution school management web app. Institutions' staff create and manage accounts for teachers, students and parents, and record attendance, results, comments, disciplinary actions, lesson material and report cards. A **public registration form** collects an applicant student's and guardians' details from visitors who have no account. The platform sends account emails on behalf of institutions. Much of the personal data is about **children** (a "minor" in Jamaica is anyone under 18).

### 2.2 The ten findings that matter most

1. **The Act applies.** The app processes personal data of people in Jamaica; the main provisions have been in force since 1 December 2023 (§5.1). The platform, as the declared sole controller (§4), carries the controller's duties: registration with the OIC, a data protection officer in the circumstances described in §5.6, a 72-hour breach notice, written contracts with processors, respecting data subject rights, and compliance with the eight standards.
2. **Student data leaves Jamaica by design.** Cloud Firestore is configured in **`us-central1` (Iowa, US)** (`firebase.json`) and a Firestore location cannot be changed after creation; Firebase Authentication processes in US data centres only; the session-lock Realtime Database defaults to the US; EmailJS runs on US servers; SMTP2GO and Vercel process in the regions you pick or globally. The eighth standard forbids transfers outside Jamaica unless the destination ensures an adequate level of protection, with listed exceptions such as the data subject's consent or contractual necessity (§5.7). **This needs a decision and a documented basis before launch.**
3. **No notice or consent exists anywhere yet.** The public registration form collects a child's and two guardians' details (including occupation and workplace) with no privacy notice and no consent. Consent under the Act must be informed, freely given, specific and unambiguous, by a clear affirmative action; pre-ticked boxes do not count (§5.4).
4. **Consent for children is the parent's or guardian's.** Where consent is needed for a minor it must be given by a parent or legal guardian unless the law recognises the minor's own capacity (§5.5). The app currently lets any institution admin create a student account and email it, with no guardian step.
5. **Sensitive personal data is close at hand.** Disciplinary actions with free-text reasons (suspension, detention, demerits) may touch "alleged commission of any offence"; photos could become biometric data if used to identify people; ID numbers (Citizen ID or TRN) are not on the Act's sensitive list but are high-risk. Sensitive data needs written consent or one of ten statutory conditions, and is one of the triggers for a data protection officer (§5.6).
6. **The platform is exposed to enforcement.** Fines up to 4% of annual gross worldwide turnover, summary fines up to J$5 million, and imprisonment up to ten years for the gravest offences (§5.9). The OIC has not reported enforcement action yet (⚠ Verify), but a children's-data platform is an obvious target.
7. **Security promises must match reality.** The Act requires appropriate technical and organisational measures. The app has real controls (Firestore rules by institution and role, App Check, tab-scoped sign-in, a one-session lock, forced password change, an audit log) and real weaknesses (role **default passwords are public** because they are in the client bundle and the docs; attendance drafts sit in `localStorage`; personal data is cached in `sessionStorage`; no multi-factor sign-in) (§10.8, §11).
8. **Retention must be stated and honoured.** Data must not be kept longer than necessary and the retention period belongs in the privacy notice. The audit log is permanent by design (rules forbid update and delete), which conflicts with erasure and retention duties unless a managed deletion path exists (§10.5).
9. **Third-party terms push responsibility onto you.** Google (Firebase) makes you responsible for consents and notices; EmailJS makes you the Controller and "solely responsible" for every message and warns that abuse ends the account; SMTP2GO requires a legitimate relationship with recipients and full control of content; **Vercel's Hobby plan is for personal, non-commercial use, so a commercial platform needs a paid plan** (§6).
10. **Several documents are missing:** Privacy Notice, Terms of Service, Disclaimer pop-up, an agreement with each institution, a breach playbook, a rights-request process, a retention schedule, a record of processing, and signed processor agreements (§10, §14).

### 2.3 Decisions needed before launch

| #   | Decision                                                                                                                      | Why it matters                                                                      | Where                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------- |
| 1   | Name the operator (legal form, address, contact) and register with the OIC                                                    | Registration is mandatory before processing; the documents must name the controller | §5.6, §12.1           |
| 2   | Confirm the controller model (sole controller versus joint/processor) with counsel                                            | The law looks at who decides purposes and means                                     | §4                    |
| 3   | Decide how the transfer to the US is lawful (consent, contract, OIC-approved terms, or move data to an adequate jurisdiction) | Eighth standard; Firestore region cannot be changed                                 | §5.7                  |
| 4   | Appoint a data protection officer (or document why not)                                                                       | Sensitive and large-scale processing                                                | §5.6                  |
| 5   | Move hosting to a plan that allows commercial use                                                                             | Vercel Hobby is non-commercial                                                      | §6.2                  |
| 6   | Set retention periods per data category                                                                                       | Storage-limitation standard; must be in the notice                                  | §10.5                 |
| 7   | Decide the guardian and age rules (account holders, email recipients, consent)                                                | Minors under 18                                                                     | §5.5, EMAIL spec §5.3 |
| 8   | Add notice and consent to the public registration form and a Disclaimer pop-up with recorded acceptance                       | Standard 1 and the right to be informed                                             | §7, §11               |
| 9   | Sign or accept the providers' data-processing terms                                                                           | Written processor contracts                                                         | §10.7                 |
| 10  | Fix the security gaps that undermine the promises (public default passwords, local storage of personal data)                  | Standard 7                                                                          | §10.8, §11            |

---

## 3. The app at a glance (facts)

All facts below come from the repository on 2026-10-03.

### 3.1 People and roles

| Role                                | Who                         | Sees                                                                   |
| ----------------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| `super_admin`                       | The platform owner          | Everything in every institution (institution `*`)                      |
| `institution_admin`                 | A school's administrator    | Everything in their own institution                                    |
| `senior_teacher`, `regular_teacher` | Teachers                    | Students and records for their classes and subjects; own audit entries |
| `student`                           | A learner (many are minors) | Their own records, schedule, results, attendance                       |
| `parent`                            | A guardian                  | Their linked children's records                                        |
| Visitor (no account)                | A parent or applicant       | The public login page, the institution list and the registration form  |

### 3.2 Services and third parties in use

| Component                            | Used for                                                                                                                                                                                                                                                                       | Location / operator                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Firebase Authentication              | Email and password sign-in; sign-in lives in the browser tab's `sessionStorage`                                                                                                                                                                                                | Google, **US data centres only**                                                                               |
| Cloud Firestore                      | Almost all data (users, records, registrations, audit log, email counters)                                                                                                                                                                                                     | Google; **`us-central1` (Iowa)** per `firebase.json`; location immutable                                       |
| Firebase Realtime Database           | Single-session lock (`sessions/{uid}`: session id and start time); **and, since the large-attachment feature, lesson-note and assignment files over 500 KB (up to 5 MB) from teachers and institution admins** (`files/{institutionId}/{key}`, with byte counters in `usage/`) | Google; default US (the database URL is the US form; ⚠ Verify)                                                 |
| Firebase App Check with reCAPTCHA v3 | Bot and abuse protection                                                                                                                                                                                                                                                       | Google (reCAPTCHA)                                                                                             |
| Vercel                               | Hosting of the single-page app                                                                                                                                                                                                                                                 | Vercel, global edge, US processing; **the project is on the Hobby plan (non-commercial)**                      |
| EmailJS (planned)                    | Browser-side bridge to send account emails                                                                                                                                                                                                                                     | EmailJS Pte. Ltd. (Singapore), **US servers on AWS**                                                           |
| SMTP2GO (planned)                    | SMTP relay behind EmailJS                                                                                                                                                                                                                                                      | SMTP2GO; US (Chicago, Washington DC), EU (Amsterdam), Australia (Sydney) regions                               |
| Not used                             | Firebase Analytics, Google Fonts or other external fonts, advertising or tracking scripts, cookies set by the app itself                                                                                                                                                       | The Firebase measurement id exists in the environment file but no analytics code runs (⚠ Verify before launch) |

### 3.3 Data inventory

| Data                                                                                                                                                                                        | Whose                                                                             | Where it lives                                                                                                                                                                                                                          | Visible to                                                                                                                                                                                                                                                 | Sensitivity (Act)                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name, email address, role, institution, status                                                                                                                                              | Every account holder                                                              | `users/{uid}`; Auth                                                                                                                                                                                                                     | Admins of the institution; teachers see students                                                                                                                                                                                                           | Personal data                                                                                                                                                                                                                                                                 |
| Phone, second phone, address, emergency contact                                                                                                                                             | Account holders (students, parents, staff)                                        | `users/{uid}`                                                                                                                                                                                                                           | Same                                                                                                                                                                                                                                                       | Personal data                                                                                                                                                                                                                                                                 |
| **ID number ("Citizen ID or TRN")**                                                                                                                                                         | Account holders                                                                   | `users/{uid}.idNumber`                                                                                                                                                                                                                  | Admins                                                                                                                                                                                                                                                     | Personal data, high risk (identity theft); data minimisation question                                                                                                                                                                                                         |
| Date of birth, gender                                                                                                                                                                       | Students                                                                          | `users/{uid}`                                                                                                                                                                                                                           | Admins, teachers                                                                                                                                                                                                                                           | Personal data (child)                                                                                                                                                                                                                                                         |
| Photo                                                                                                                                                                                       | Students, staff, registrants                                                      | `users/{uid}/photo/current` as a base64 data URL; also in registrations                                                                                                                                                                 | Admins; teachers see student photos                                                                                                                                                                                                                        | Personal data; **biometric if used to identify**                                                                                                                                                                                                                              |
| Class, house, student number                                                                                                                                                                | Students                                                                          | `users/{uid}`                                                                                                                                                                                                                           | Staff                                                                                                                                                                                                                                                      | Personal data                                                                                                                                                                                                                                                                 |
| Guardian links                                                                                                                                                                              | Parents and students                                                              | `student_parents`                                                                                                                                                                                                                       | Admins; the parent                                                                                                                                                                                                                                         | Personal data                                                                                                                                                                                                                                                                 |
| **Public registration** (student: names, DOB, gender, email, requested class, last school attended, optional photo; mother and father: names, address, phone, email, occupation, workplace) | Applicants and guardians                                                          | `institutions/{id}/registrations`                                                                                                                                                                                                       | Admins of that institution                                                                                                                                                                                                                                 | Personal data (child and adults); **collected with no notice or consent today**                                                                                                                                                                                               |
| Attendance (state per student per session, excused reasons)                                                                                                                                 | Students                                                                          | `attendance` documents and summaries                                                                                                                                                                                                    | Staff, student, parent                                                                                                                                                                                                                                     | Personal data; excused reasons can reveal **health**                                                                                                                                                                                                                          |
| Results, gradebook, feedback and report-card comments, report cards, progress reports                                                                                                       | Students                                                                          | Firestore                                                                                                                                                                                                                               | Staff, student, parent                                                                                                                                                                                                                                     | Personal data (a child's evaluation)                                                                                                                                                                                                                                          |
| **Disciplinary actions** (merit, demerit, detention, suspension with a free-text reason)                                                                                                    | Students                                                                          | Firestore                                                                                                                                                                                                                               | Staff, student, parent                                                                                                                                                                                                                                     | Personal data; **possibly "alleged commission of an offence"**                                                                                                                                                                                                                |
| Lesson notes, assignment submissions and attempts                                                                                                                                           | Staff, students                                                                   | Firestore; submissions carry a retention date (`deleteAt`). Teacher and admin files over 500 KB are in the Realtime Database (next row). Students and parents can read only the lesson-note files of their own or their child's classes | Staff, student                                                                                                                                                                                                                                             | Personal data; student work                                                                                                                                                                                                                                                   |
| Rubric files (up to 500 KB, teacher and admin uploads)                                                                                                                                      | Staff, students, parents                                                          | Firestore, as base64. Kept until deleted; no retention date. No malware scanning. Teachers are told not to include student names or marks, but the app can't check, and Word and PDF files can carry an author's name.                  |
| **Large lesson-note and assignment files** (500 KB to 5 MB, teacher and admin uploads only; student submissions are not stored here)                                                        | Staff-authored teaching material, which may contain student names or work samples | Realtime Database `files/{institutionId}/{key}` (US)                                                                                                                                                                                    | **Any signed-in account that holds the file's key**: an unguessable UUID kept only in Firestore records that the usual rules protect. The database **cannot check roles, classes or institutions**, so there is no per-role enforcement on the file itself | Personal data possible. **No automatic expiry**: a file is removed when its note or assignment is deleted or its file replaced; leftovers only by the owner-run `scripts/sweep-orphan-blobs.mjs` (7-day grace). See `docs/miscellaneous-specs/LARGE_ATTACHMENTS_RTDB_SPEC.md` |
| **Audit log** (who changed what, when) and **activity log**                                                                                                                                 | Staff and students                                                                | `institutions/{id}/audit_log`, `users/{uid}/activity_log`; entries are permanent                                                                                                                                                        | Admins; teachers see their own                                                                                                                                                                                                                             | Personal data (staff and student identifiers, actions)                                                                                                                                                                                                                        |
| Session record                                                                                                                                                                              | Every signed-in user                                                              | Realtime Database `sessions/{uid}`                                                                                                                                                                                                      | The user                                                                                                                                                                                                                                                   | Technical                                                                                                                                                                                                                                                                     |
| Email counters, credential-email stamps (planned)                                                                                                                                           | Account holders                                                                   | Firestore                                                                                                                                                                                                                               | Admins                                                                                                                                                                                                                                                     | Technical / personal                                                                                                                                                                                                                                                          |
| Sign-in credentials                                                                                                                                                                         | Account holders                                                                   | Firebase Auth (password hashes)                                                                                                                                                                                                         | Nobody can read them; role defaults are public                                                                                                                                                                                                             | Security                                                                                                                                                                                                                                                                      |

### 3.4 Browser storage inventory

No cookies are set by the app's own code. Firebase Auth uses browser storage (`browserSessionPersistence`).

| Key                                            | Storage                  | Purpose                                                                                                                                                                                     | Personal data?                                                                                                                                                                        |
| ---------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firebase Auth entries                          | `sessionStorage`         | Keeps the sign-in for the tab                                                                                                                                                               | Token, email                                                                                                                                                                          |
| `sms_signin_logged`                            | `sessionStorage`         | Avoids duplicate sign-in log entries                                                                                                                                                        | No                                                                                                                                                                                    |
| `sms_session_id`                               | storage (⚠ Verify which) | Single-session lock identifier                                                                                                                                                              | Technical                                                                                                                                                                             |
| `sms_pending_login_institution`                | `sessionStorage`         | Institution chosen on the login page                                                                                                                                                        | No                                                                                                                                                                                    |
| `sms_filter_*` (selected class, subject, term) | `sessionStorage`         | Remembers filters                                                                                                                                                                           | Ids only                                                                                                                                                                              |
| `sms_query_cache`                              | `sessionStorage`         | Cached reference data only (terms, classes, subjects, departments; up to 30 minutes), stamped with the signed-in user and removed at sign-out                                               | No personal data (allow-listed roots; see `src/lib/queryPersistence.ts`)                                                                                                              |
| `sms_note_files`                               | IndexedDB                | Copies of lesson-note files the person downloaded, and a record of which, so a repeat costs no download. Removed at sign-out, or when someone else signs in; the browser may also remove it | Teaching files, user id                                                                                                                                                               |
| `sms_offline`                                  | IndexedDB                | Staff only (teachers and institution admins). Encrypted copies (AES-GCM, a key per person) of the profile and institution, unsaved attendance entries, and what the registers last read online: class and subject class lists, the week's saved registers, and the calendar, classes and subjects. Removed at sign-out, or when someone else signs in | **Yes: student names and ids, and attendance per student, encrypted; kept after the tab closes until sign-out** |
| `sms_offline_key`                              | `sessionStorage`         | The key that opens `sms_offline`, for this tab only, so the tab keeps working through an offline reload | The key and user id; gone when the tab closes or at sign-out |
| `sms_outbox`                                    | IndexedDB                | Staff at institutions with the outbox on. Encrypted register saves waiting to reach the server (the changed marks, register names and an audit line), sealed with the person's key, with the owner and register stored as one-way tags. Not removed at sign-out: kept until sent, discarded, or 7 days old (removal at expiry arrives with slice C2) | **Yes: attendance per student, encrypted; kept after sign-out until sent** |
| `sms_offline_prefetched`                       | `localStorage`           | The day today's registers were last fetched in the background, so it happens once a day on each device | User id and a date; removed at sign-out |
| `attendance_draft:{uid}:*`                     | `localStorage`           | Unsaved attendance entries, keyed to the signed-in user, for anyone without an offline key (staff entries go to `sms_offline` once the key is ready), 24 hour expiry, removed at sign-out                                                                                                | **Yes: attendance state per student and optional excused reason, persisting after the tab closes until sign-out or expiry**                                                           |
| Firestore SDK cache                            | memory only              | Documents read in the current page load                                                                                                                                                     | Held in memory, gone on reload or sign-out. Builds before 2026-10 also wrote an IndexedDB database (`firestore/[DEFAULT]/...`); it is deleted once per browser (`sms_idb_cleaned_v1`) |
| `theme`, `sidebar-collapsed`                   | `localStorage`           | Display preferences                                                                                                                                                                         | No                                                                                                                                                                                    |
| `sms_data_mode_v2`                             | `localStorage`           | Developer data-mode switch (development only)                                                                                                                                               | No                                                                                                                                                                                    |

### 3.5 Main data flows

1. **Public registration:** a visitor completes the form; data goes straight into the institution's `registrations`; an admin reviews it and may convert it into student and parent accounts.
2. **Account creation:** an admin creates an account with a role default or typed password and `mustChangePassword: true`; the person must change it at first sign-in.
3. **Sign-in:** Firebase Auth; a single-session record is written to the Realtime Database; the account's institution is checked against the one chosen on the login page.
4. **Daily use:** staff write records; students and parents read their own.
5. **Email (planned):** the app builds a message and sends it through EmailJS to the SMTP2GO relay; the message carries the person's name, address, institution and a temporary password (see the email spec).
6. **Audit:** admin and teacher actions that change other people's records write permanent audit entries.

---

## 4. Roles under the law: who is the controller

### 4.1 Terms

The Act uses **data controller** (decides the purposes and means of processing), **data processor** (processes on a controller's behalf) and **data subject** (the individual). Providers use the same words in their own terms (§6).

### 4.2 The decision taken

The project owner chose that the **platform is the sole data controller** for the personal data processed through the app. In practice this means, and the drafts in §7 to §9 assume:

- The platform (the operator) is the party named in the Privacy Notice as controller, registers with the OIC, appoints or designates the data protection officer, writes the notices, records consent, answers rights requests, notifies breaches, and signs processor agreements with Google, Vercel, EmailJS and SMTP2GO.
- **Institutions are customers and authorised users.** They supply the data, decide which of their people receive accounts, and use the app under the Terms of Service. They warrant that they have the authority to supply the data and have given guardians the required notice (§9), and they agree to follow the platform's instructions on how data is entered and used.
- Providers are the platform's **processors** (Google, Vercel, EmailJS, SMTP2GO), under their data-processing terms.

### 4.3 Risk of this model and the fallback

The law looks at who actually decides why and how personal data is used, not at what a contract says. A school decides which children it enrols, what is recorded about them, and for what educational purposes; a regulator or court could treat the school as a controller (or a joint controller) of its own students' records even where the contract names the platform. Risks of the "sole controller" model:

- the platform takes on **every** controller duty for every institution's data, including notices to every student and guardian, large-scale processing of children's data and the data protection officer requirement;
- the institution may still have its own duties (for example as a public authority or an employer) that the contract cannot remove;
- liability flows to the platform first.

**Fallback (have counsel confirm which model fits):** _institution = controller, platform = processor_ for student, parent and staff records, with the platform as controller only for its own platform data (account and security logs, audit data it needs to run the service, billing, platform accounts). That model needs a data-processing agreement with each institution (clauses are in §9.3) and moves notices and consent to the institution. A middle option is **joint controllers** with a written arrangement setting out who does what. The drafts mark the clauses that change under the fallback with **[SOLE-CONTROLLER MODEL]**.

### 4.4 Consequences to reconcile in the project's own documents

- `docs/miscellaneous-specs/EMAIL_INTEGRATION_SPEC.md` (§14 and §16) puts the lawful basis, consents and notices for recipients on the institution. Under the sole-controller model they sit with the platform; that spec should be updated when this model is confirmed.
- The institution's reply address (Reply-To) and its name appear in the message; the platform stays the controller of the email's personal data.

---

## 5. Jamaican law

> Sources: Parliament's Act PDF (unreadable to the tool), Office of the Information Commissioner pages (`oic.gov.jm`), Myers, Fletcher & Gordon, DunnCox, Chambers Data Protection & Privacy 2026 (Jamaica), RecordingLaw's 2026 guide, and news and law-firm summaries. **⚠ Verify every detail against the Act and the OIC's guidance.**

### 5.1 The Data Protection Act, 2020: timeline, scope and regulator

| Item                 | What the sources say                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enactment and phases | Passed in 2020; the provisions that set up the OIC took effect on 1 December 2021; the full operative provisions (the eight standards, rights, enforcement) took effect on **1 December 2023**                                                                                                                                            |
| Regulator            | **Office of the Information Commissioner (OIC)**, Kingston; Information Commissioner appointed December 2021; website `oic.gov.jm`; keeps a public register of data controllers and handles complaints, investigations and enforcement                                                                                                    |
| Who is covered       | Controllers and processors established in Jamaica; non-Jamaican controllers using equipment in Jamaica; non-Jamaican controllers offering services to, or monitoring the behaviour of, people in Jamaica (they must appoint a representative in Jamaica)                                                                                  |
| Registration portal  | Opened **1 June 2024** (public authorities first, then large processors in education, finance, health, ICT and tourism). One source reports the portal being offline for upgrades in 2026 with an OIC advisory (15 March 2026) that no liability arises for unregistered processing while it is offline (**⚠ Verify the current status**) |
| Regulations (2024)   | Data Protection Regulations 2024 (breach procedure, DPO qualifications, consent standards, impact assessment); Data Protection (Data Controller Registration) Regulations 2024 (process, forms, fees); Data Protection (Disposal of Personal Data) Regulations 2024 (approved disposal methods)                                           |

### 5.2 Key definitions

| Term                    | Meaning (summary)                                                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal data           | Information relating to an identified or identifiable living individual                                                                                                                                                                                                    |
| Sensitive personal data | Genetic or biometric data; filiation, racial or ethnic origin; political opinions, philosophical, religious or similar beliefs; trade-union membership; physical or mental health or condition; sex life; the alleged commission of any offence and any proceedings for it |
| Data controller         | The person who, alone or jointly, decides the purposes and means of processing                                                                                                                                                                                             |
| Data processor          | A person who processes personal data on behalf of a controller (not an employee)                                                                                                                                                                                           |
| Minor                   | An individual under **18**                                                                                                                                                                                                                                                 |
| Consent                 | Freely given, specific, informed and unambiguous, by a clear affirmative action; silence, pre-ticked boxes and inactivity do not count; for sensitive data it must be **written** (or another statutory condition must apply)                                              |

### 5.3 The eight data protection standards, mapped to the app

| #   | Standard (summary)                                                                                                                                                                                                                                                                                                                      | What it means for the app                                                                                                                                                                                                                                                                   | Status today / action                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Fair and lawful processing.** No deception; a lawful condition must be met (consent, contract, legal obligation, vital interests, public-interest task, legitimate interests; sensitive data needs written consent or one of ten conditions). Consent is not freely given if a service is conditioned on more data than is reasonable | The platform needs a lawful condition for each purpose (enrolment administration, attendance, assessment, discipline, communications). Consent will be the main basis for children's and guardians' data collected directly; contract and legitimate interests can support running accounts | **Gap:** no notice or consent on the public registration form or at sign-in; no record of acceptance. See §7, §11                                                                                                                    |
| 2   | **Specified, lawful purposes.** Collect for stated purposes; do not reuse for another purpose without notice and consent                                                                                                                                                                                                                | State purposes in the Privacy Notice; do not use student data for marketing or analytics beyond them                                                                                                                                                                                        | Draft purposes in §8; code review for any other use                                                                                                                                                                                  |
| 3   | **Adequate, relevant, not excessive**                                                                                                                                                                                                                                                                                                   | Collect only what the app needs. Question the ID number (Citizen ID/TRN), occupation and workplace on the registration form, the free-text disciplinary reason, and the second phone                                                                                                        | **Gap:** review each field; make ID number optional or drop it unless a legal need exists                                                                                                                                            |
| 4   | **Accurate and up to date**                                                                                                                                                                                                                                                                                                             | Let admins and, where possible, users correct data; refresh registrations; stale accounts                                                                                                                                                                                                   | Admin edit forms exist; add a guardian-driven correction route (§10.4)                                                                                                                                                               |
| 5   | **Not kept longer than necessary; tell people the retention period**                                                                                                                                                                                                                                                                    | Define a retention schedule; delete or anonymise at the end; the Notice states periods                                                                                                                                                                                                      | **Gap:** no schedule; the audit log is permanent; assignment submissions have a retention date; large lesson-note and assignment files in the Realtime Database have no automatic expiry (owner-run sweep only); no deletion tooling |
| 6   | **Rights of data subjects** (access, rectification, blocking, erasure, prevention of processing, direct-marketing objection, automated decisions, portability)                                                                                                                                                                          | A process, a contact, deadlines (§5.4) and tools to find, export, correct and delete one person's data                                                                                                                                                                                      | **Gap:** no export or erasure tool; no request log                                                                                                                                                                                   |
| 7   | **Security.** Appropriate technical and organisational measures (for example encryption, pseudonymisation, access control, resilience, backups, testing); processors under written contract; the controller remains responsible; breach reporting                                                                                       | See §10.8 for a control-by-control comparison; sign processor terms (§10.7)                                                                                                                                                                                                                 | **Gaps:** public default passwords; personal data in `localStorage` and `sessionStorage`; no MFA; no documented backup                                                                                                               |
| 8   | **No transfer outside Jamaica without adequate protection**                                                                                                                                                                                                                                                                             | Firestore (US), Auth (US), Realtime Database (US), EmailJS (US), SMTP2GO and Vercel (regions) all transfer data out of Jamaica                                                                                                                                                              | **Gap:** no decision or documentation. See §5.7                                                                                                                                                                                      |

### 5.4 Lawful conditions, consent and notice

- **Conditions (s.23, per secondary sources):** consent; necessity for a contract with the data subject (or steps requested before one); a legal obligation of the controller; the vital interests of a person; a task in the public interest or an official authority; the controller's or a third party's legitimate interests (not overridden by the data subject's rights).
- **Sensitive data (s.24):** written consent or one of ten listed conditions (for example employment or social-security obligations, vital interests where consent is impossible, legal claims, substantial public interest). ⚠ Verify the list.
- **Consent requirements for the app:** an unticked box and a clear button; plain language; the purposes and the retention period stated; easy withdrawal; a record of who accepted what version and when; separate consent for separate purposes (for example showing a photo to others); no "bundling" beyond what the service needs.
- **Right to be informed:** privacy information must be given **before or at the time of collection** (or without undue delay if collected indirectly). That is why the public registration form needs its own notice (§7.6, Appendix B).

### 5.5 Children

- A **minor is under 18**. The rights of a minor under the Act may be exercised by a **parent or legal guardian**, or by the minor where the law recognises the minor's capacity to act in the matter.
- Where consent is required, **a minor's consent must be given by a parent or legal guardian** unless the law recognises the minor's capacity.
- **App implications:** (a) the person who completes the public registration form is usually a guardian: capture a guardian declaration; (b) student accounts exist for children of all ages (the form requires only that a student is at least three years old): decide who accepts the Terms and Notice for a student account (the guardian, recorded against the student); (c) credentials of young students go to a guardian (the age threshold, default 16 in the email spec, is a platform setting for counsel to confirm against 18); (d) do not use children's data for marketing; (e) a data protection impact assessment is wise.
- **Child Care and Protection Act 2004:** a "child" is under 18; the Act restricts disclosing information from which a child's identity in a protection report can be inferred. Disciplinary and welfare information about a child should be shared only on a need-to-know basis; do not put such detail in emails.

### 5.6 What a controller must do

| Duty                                        | Detail (per sources)                                                                                                                                                                                                                                                                                                                                          | Application                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Register with the OIC before processing** | Particulars: identity, categories of data, purposes, recipients, retention periods, security measures. Annual renewal by **1 December**. Changes reported within **14 days**. Fees (⚠ Verify): company J$25,000 first and J$15,000 renewal; partnership J$15,000 and J$10,000; sole trader J$7,500 and J$5,000. Processing without registration is an offence | The platform registers (and checks whether institutions must register in their own right)                                               |
| **Data protection officer**                 | Mandatory for public authorities, anyone processing **sensitive** data or criminal-conviction data, **large-scale** processing, or as the Commissioner directs. Must be qualified and independent. Designating a responsible officer is recommended even where not required                                                                                   | A platform processing many children's records, including discipline, should assume a DPO is needed; appoint one (a person or a service) |
| **Annual assessment (s.45)**                | A report within **90 days after the end of each calendar year** describing the processing carried out, its necessity and proportionality, and the safeguards                                                                                                                                                                                                  | Calendar item for 31 March each year; outline in §10.6                                                                                  |
| **Breach notification**                     | Report a security breach (or potential breach) affecting personal data to the **Commissioner within 72 hours** of becoming aware, and tell each affected data subject within 72 hours. The OIC notice (Form 7, ⚠ Verify) states the facts, nature, categories and volumes, consequences and remedial measures, and the DPO's contact                          | Playbook in §10.3                                                                                                                       |
| **Processor contracts**                     | Where processing is outsourced the controller must obtain adequate security guarantees through a **written contract** and monitor compliance                                                                                                                                                                                                                  | Sign or accept the providers' terms (§10.7)                                                                                             |
| **Records and policies**                    | Keep records of processing, retention and disposal policies; use approved disposal methods                                                                                                                                                                                                                                                                    | §10.5, §10.6                                                                                                                            |
| **Rights requests**                         | Respect the rights in §5.8 within the time limits                                                                                                                                                                                                                                                                                                             | Playbook in §10.4                                                                                                                       |

### 5.7 Transfers outside Jamaica (the eighth standard)

- **Rule:** personal data shall not be transferred to a State or territory outside Jamaica unless that place ensures an **adequate level of protection** for data subjects' rights and freedoms in relation to the processing. Adequacy is judged in all the circumstances: the nature of the data, the places of origin and final destination, the purposes and the period of processing, the law and international obligations of the destination, and the security measures taken. The Commissioner's views carry weight.
- **Exceptions (per sources):** the data subject's **consent**; necessity for performing a **contract** with the data subject or one in their interest; **substantial public interest**; legal proceedings, advice or defending rights; protecting **vital interests**; public-register data; transfers on terms or authorisations **approved by the Commissioner**; national security or crime prevention. ⚠ Verify the exact wording and whether more than one exception may be combined.
- **What the app transfers:** all of §3.3 to Google's US infrastructure (Firestore `us-central1`, Auth, Realtime Database), the email data to EmailJS (US) and SMTP2GO (chosen region), and visitor data to Vercel (US). None of these providers' terms mention Jamaican law; their transfer mechanisms (Standard Contractual Clauses, the Data Privacy Framework) are for Europe, the UK and Switzerland.
- **Options, in order of robustness:**
  1. **Obtain explicit, informed consent to the transfer** from each data subject (a guardian for a minor) at registration and at first sign-in, naming the US and the providers (§7, §8). Practical and the likeliest route, but consent can be withdrawn and must be genuinely free; conditioning enrolment on it is questionable.
  2. **Rely on contractual necessity** for the data needed to run an account, with the contract between the platform and the data subject or guardian. Counsel must confirm this applies to students' data supplied by an institution.
  3. **Seek the Commissioner's authorisation or approved terms** for the transfers (data-processing terms with each provider and the institution).
  4. **Change location** where possible. Firestore's location is **immutable**, so moving means creating a new Firebase project or database and migrating, which is costly after launch; decide **before** real data is stored. No Firebase location is in Jamaica; the nearest options are in the US or elsewhere in the Americas, so a move would not by itself remove the transfer.
- **Recommendation:** treat options 1 and 3 together, document the assessment, name the countries and providers in the Notice, and record the decision in §12.

### 5.8 Data subject rights and how the app supports each

| Right                                                                                        | Time limit / rule (per sources)                                                                | How to support it                                                                                                                       |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Be informed**                                                                              | Before or at collection                                                                        | Disclaimer, registration-form notice, email footer, Privacy Notice                                                                      |
| **Access**                                                                                   | Confirm processing and give access within **30 days** of a valid request                       | A request channel and an export (profile, attendance, results, comments, disciplinary actions, audit entries about the person)          |
| **Rectification, blocking, erasure, destruction** of inaccurate or unlawfully processed data | Reasonable time; controller must act or explain                                                | Admin edit forms; a deletion procedure that also covers photos, registrations, audit and activity entries, backups and processor copies |
| **Prevent processing** causing unwarranted damage or distress                                | Controller responds within **21 days** (⚠ Verify)                                              | Request log; flag an account as restricted                                                                                              |
| **Object to direct marketing**                                                               | Unconditional                                                                                  | The app does no marketing; say so and keep it that way                                                                                  |
| **Automated decisions**                                                                      | No purely automated decisions with legal or similarly significant effects without human review | The app makes none; say so                                                                                                              |
| **Portability**                                                                              | Structured, commonly used, machine-readable format                                             | Export as JSON or CSV                                                                                                                   |
| **Rights of a minor**                                                                        | Exercised by the parent or legal guardian (or by the minor where the law recognises capacity)  | Verify the requester is the guardian linked to the student                                                                              |
| **Complaint**                                                                                | To the OIC                                                                                     | State the OIC's contact in the Notice                                                                                                   |

### 5.9 Enforcement and penalties

- **Organisations:** fines up to **4% of annual gross worldwide turnover**.
- **Individuals and gravest offences:** summary fines up to **J$5 million** (J$2 million for breaching the data protection standards); imprisonment up to **ten years** on indictment, with no stated ceiling on a Circuit Court fine.
- **Tools:** enforcement notices, fixed-penalty notices (pay and remedy within 30 days to discharge liability), prosecution, and civil liability for damages (a data subject may sue for loss caused by a breach).
- **Track record:** as of the sources, the Commissioner has not announced enforcement action (⚠ Verify). Do not read that as low risk for a children's-data platform.

### 5.10 Other Jamaican laws that touch the app

| Law                                                                 | Relevance                                                                                                                                         | Notes                                                                                                                                                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Constitution, Charter of Fundamental Rights and Freedoms (2011)** | Protects respect for private and family life, the privacy of the home and the privacy of communications and other property (s.13(3)(j), ⚠ Verify) | Background to the Act; informs how courts read privacy                                                                                                                                             |
| **Cybercrimes Act, 2015 (as amended)**                              | Offences for unauthorised access to programs or data, data interference, computer fraud, identity theft and misuse of devices                     | Admins and staff must not access records beyond their role; forging requests through the email public key or guessing default passwords could be offences; note this in the Terms (acceptable use) |
| **Electronic Transactions Act, 2006**                               | Electronic records, offers and acceptances, and electronic signatures have legal effect if reliable                                               | Click-through acceptance of the Terms and consent is valid when recorded reliably (version, time, identity); keep the acceptance record (EMAIL spec §12.3)                                         |
| **Child Care and Protection Act, 2004**                             | A child is under 18; restricts disclosure of a child's identity in protection matters; reporting duties                                           | Handle welfare and disciplinary information narrowly; no such detail in email                                                                                                                      |
| **Access to Information Act, 2002**                                 | Applies to public authorities; public schools' records may be requestable                                                                         | Matters if public institutions use the app; their records stay subject to the Act                                                                                                                  |
| **Copyright Act**                                                   | Student and teacher work, lesson notes and uploaded material                                                                                      | Terms: users keep ownership and grant the platform a licence to host and display                                                                                                                   |
| **Education laws and regulations**                                  | May set school record-keeping and retention duties (⚠ Verify with the Ministry of Education and Youth)                                            | Retention periods in §10.5 must not conflict                                                                                                                                                       |
| **Consumer protection and contract law**                            | If parents pay fees through the app or sign up as consumers, fairness rules limit exclusion clauses                                               | Keep liability limits reasonable and clear                                                                                                                                                         |

### 5.11 If the app expands beyond Jamaica

Other Caribbean territories have their own data-protection laws (for example Barbados, the Bahamas, Trinidad and Tobago); the EU's and UK's GDPR apply to people in Europe; the US COPPA applies to services directed to children under 13 in the US. None of these has been researched here. Re-run this guide for each new market and treat the Notice's transfer and rights sections as the first things to change.

---

## 6. Provider policies

### 6.1 Firebase and Google Cloud

**Terms stack.** The Firebase Terms of Service (effective 2026-09-24) direct core services (Firestore, Authentication, Storage, Functions) to the **Google Cloud Platform Terms of Service**; Hosting and Realtime Database refer to the Google APIs Terms plus Firebase-specific terms; all services are subject to the **Firebase Data Processing and Security Terms** (DPST).

| Topic                   | What the documents say                                                                                                                                                                                                                                                         | Consequence for the app                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roles                   | Customer is the controller (or business); **Google is the processor**                                                                                                                                                                                                          | Fits the sole-controller model; the platform answers for the data and for rights requests; Google notifies the customer of requests it receives                                   |
| Consents and notices    | GCP Terms s.3.2: the customer is **responsible for obtaining any consents and notices** needed to use the services and to let Google process the data                                                                                                                          | Notice and consent are the platform's job                                                                                                                                         |
| Acceptable use          | AUP, no high-risk activities, no HIPAA data without a BAA, no reselling the services                                                                                                                                                                                           | Do not store health records as such; the Terms of Service must forbid it                                                                                                          |
| Security                | DPST: encryption in transit (TLS), at rest for Firestore, Auth and Realtime Database; access controls; ISO 27001, 27017, 27018 and SOC 1/2/3                                                                                                                                   | Cite carefully in the Notice ("industry-standard measures"); do not promise more than Google does                                                                                 |
| Data location           | **Authentication: US only.** Most services run across Google infrastructure unless a location is chosen; Firestore and some others offer residency choices. **Firestore location is fixed at creation; this project uses `us-central1`.** Realtime Database defaults to the US | The transfer analysis in §5.7 is unavoidable; changing Firestore's region means a new database                                                                                    |
| Sub-processors          | Customer generally authorises Google's sub-processors; **30 days' notice** of new ones; objection within 90 days                                                                                                                                                               | Monitor the notices; the Notice lists "Google and its sub-processors"                                                                                                             |
| International transfers | Standard Contractual Clauses apply to restricted European transfers; nothing is offered for Jamaica                                                                                                                                                                            | A Jamaican basis is the platform's responsibility (§5.7)                                                                                                                          |
| Retention and deletion  | Authentication keeps IP addresses for weeks; other Auth data until the customer deletes it (removed within 180 days of a deletion request); App Check tokens up to 7 days; deletion on termination within 180 days after a 30-day recovery window                              | The Notice's retention table cites these; erasure of a person means deleting Auth user, Firestore documents and the Realtime Database record, then waiting for backups to age out |
| Breach                  | Google notifies the customer "promptly and without undue delay"                                                                                                                                                                                                                | The platform's 72-hour clock starts when it becomes aware; set up a monitored contact address for Google notices                                                                  |
| Suspension              | Google may suspend for AUP violations (24-hour notice) or immediately to protect services or comply with law                                                                                                                                                                   | Keep an export of critical data; have a contingency plan                                                                                                                          |
| Spark (free) plan       | Fixed quotas (for example Firestore daily reads and writes); no billing; service commitments apply to paid services (⚠ Verify the Spark position and any SLA)                                                                                                                  | Availability is best-effort; the Terms must not promise uptime; cap abusive load                                                                                                  |
| Children                | The GCP Terms excerpt read does not address child-directed services; US COPPA obligations are the developer's                                                                                                                                                                  | Jamaican child rules are in §5.5; no child-directed marketing or analytics                                                                                                        |

**Firebase App Check and reCAPTCHA.** App Check uses reCAPTCHA v3 to attest the app. Google's guidance: if the badge is hidden, the site must still say it is protected by reCAPTCHA; from **2 April 2026** reCAPTCHA acts as a data processor and the former duty to show Google's Terms and Privacy Policy links is removed (⚠ Verify the current requirement). The Privacy Notice and the Disclaimer should state that Google reCAPTCHA is used for security and that it processes technical data such as IP address and device signals.

**Firebase Authentication specifics.** Stores email, password hashes, last sign-in times and IPs (for weeks). Sign-in is held in the tab's `sessionStorage` here, so closing the tab ends the session.

### 6.2 Vercel (hosting)

| Topic         | Position                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Roles         | For a customer's hosted site, Vercel processes end-user data **as the customer's processor**; for its own account and marketing data it is a controller                                                                                                |
| DPA           | Vercel offers a Data Processing Addendum; accept it in the account or the legal page                                                                                                                                                                   |
| Data location | Processes in the US and other jurisdictions; uses standard contractual clauses and the EU-US, UK extension and Swiss-US Data Privacy Frameworks                                                                                                        |
| Logs          | Collects visitor IP addresses and coarse location through normal service operation; retention "for the minimum necessary period"                                                                                                                       |
| **Plan**      | **The Hobby plan is for personal, non-commercial use.** A commercial multi-institution platform is outside it; upgrade to **Pro** (about US$20 per user per month) before launch. This is a **terms-of-service compliance issue**, not just a cost one |

### 6.3 EmailJS

(From the three PDFs supplied; see also `EMAIL_INTEGRATION_SPEC.md` §12.1.)

| Topic               | Position                                                                                                                                                                                                                                        | Consequence                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Operator and law    | EmailJS Pte. Ltd., Singapore; Singapore law and courts; disputes individually, no class actions                                                                                                                                                 | Disputes with EmailJS are in Singapore                                                 |
| Account holder      | Must be **16 or older**; no bot-registered accounts                                                                                                                                                                                             | The owner of the EmailJS account must be an adult individual or authorised entity      |
| Responsibility      | "Each user is solely responsible for all of his, her, or their messages sent through the Service"; no responsibility for third-party claims                                                                                                     | The platform answers for every email; Terms must pass obligations to institutions      |
| Spam and consent    | Prohibits spam and bulk or mailing-list email to people who have **not specifically agreed**; prohibits unlawful use                                                                                                                            | Account emails are expected, one-to-one; the footer says why; never marketing          |
| One free account    | **Multiple free accounts are "not considered acceptable use"**                                                                                                                                                                                  | One platform account only                                                              |
| Inactivity          | Free accounts inactive for over a year may be deleted, content erased immediately                                                                                                                                                               | Keep it in use                                                                         |
| Warranty, SLA       | "As is"; no guarantee of reliability or security; SLA credits are a share of a paid plan's cost                                                                                                                                                 | The Terms must not promise delivery or uptime                                          |
| Roles under privacy | EmailJS has no direct relationship with the people emailed (Users-of-Users); the account holder is the **Controller**, responsible for security, integrity, authorised use, consents and notices; recipients' requests go to the account holder | Consistent with sole controller; the platform handles requests                         |
| Data collected      | Account email and name; **request activity (copies of requests, can be switched off in the template's Settings tab)**; **request metadata (Events page)**; temporary IP logs; payment confirmations                                             | Switch activity logging off; disclose metadata                                         |
| Retention           | Active accounts keep data for **30 days**; deletion immediate on account deletion                                                                                                                                                               | State in the Notice                                                                    |
| Location            | **Servers in the USA on AWS**; subprocessors Cloudflare, AWS, Zendesk, Sentry (all US)                                                                                                                                                          | Transfer analysis (§5.7); list in the Notice                                           |
| Disclosure          | Only to competent Singapore authorities on binding requests                                                                                                                                                                                     | Mention in the Notice                                                                  |
| DPA                 | Offered; covers GDPR, UK and Swiss law (and the nFADP page confirms the Swiss update); not Jamaican law                                                                                                                                         | Accept it; add Jamaican terms in the platform's own agreements                         |
| Children            | Collects nothing from under-13s; its service is directed to people 16 and older                                                                                                                                                                 | About its account holders, not our recipients; the guardian rule covers young students |

### 6.4 SMTP2GO

| Topic         | Position                                                                                                                                                                                                                                                                                                                                                     | Consequence                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Roles and DPA | GDPR-compliant; a Data Processing Agreement is accepted in the account (Settings > Display Settings > Review Agreement)                                                                                                                                                                                                                                      | Accept it; keep a copy                                                  |
| Regions       | Data centres in the **US** (Chicago, Washington DC), **EU** (Amsterdam) and **Australia** (Sydney), plus Google Cloud and AWS                                                                                                                                                                                                                                | Choose a region deliberately (§5.7); record it in the Notice            |
| Retention     | Email body not stored by default; headers and basic information stored encrypted (AES-256) and deleted after **35 days** by default; archiving (3 months to 5 years) is a paid option; free accounts see 5 days of activity                                                                                                                                  | State in the Notice; do not enable archiving                            |
| Terms         | Recipients must be people with a legitimate relationship (customers, members, subscribers or those who opted in); lists 100% opt-in; **no sending from addresses you have no permission to use**; you must control content and must not auto-forward third-party email; immediate suspension for violations; bounce monitoring (0 to 8% good, over 12% poor) | Fits one-to-one account emails; keep bounces low                        |
| Unsubscribe   | The unsubscribe-link rule is for mailing lists; strictly transactional mail needs none                                                                                                                                                                                                                                                                       | Keep the SMTP user's unsubscribe footer off; do not use for newsletters |
| Free plan     | "Primarily for trial purposes and for sending low amounts of email"; a business must not create more than 10 free accounts; new accounts are reviewed                                                                                                                                                                                                        | A commercial platform should expect to move to a paid plan              |
| Sender rules  | Every From must be a verified sender; Gmail and Yahoo addresses cannot be verified; a sender domain gives aligned SPF and DKIM                                                                                                                                                                                                                               | Send from a verified sub-domain of the platform's domain                |

### 6.5 Provider comparison

| Provider           | Role                                         | Data it sees                                                                                | Location                                  | Retention                                                                       | Agreement to accept                                                  |
| ------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Google Firebase    | Processor                                    | All app data (Firestore, Auth, RTDB), App Check tokens                                      | **US** (Firestore `us-central1`, Auth US) | Until deleted; 180 days after deletion; Auth IPs weeks; App Check tokens 7 days | Firebase DPST (part of the terms; confirm acceptance in the console) |
| Vercel             | Processor (customer data)                    | Visitor IPs, request logs, the app bundle (which contains the public default passwords)     | US and edge locations                     | Minimum necessary                                                               | Vercel DPA; **move off Hobby**                                       |
| EmailJS            | Processor (Controller is the account holder) | Recipient name and email, institution, temporary password, template values                  | **US (AWS)**; company in Singapore        | 30 days (request logging off recommended)                                       | EmailJS DPA                                                          |
| SMTP2GO            | Processor                                    | Message headers, recipient addresses, sender, delivery events; body only if archiving is on | US, EU or AU (chosen)                     | 35 days default; 5 days visible on free                                         | SMTP2GO DPA                                                          |
| reCAPTCHA (Google) | Processor from 2 April 2026                  | IP address and device signals                                                               | Google                                    | Per Google                                                                      | Google terms                                                         |

---

## 7. The Disclaimer pop-up

### 7.1 Purpose

Give every visitor **notice** at the first moment they meet the app, before the login or the registration form, and capture an **affirmative acceptance**. It supports the right to be informed and the consent standard; it is **not proof of consent for a person** (it is stored only in the browser), so a per-account acceptance is also recorded at first sign-in (`EMAIL_INTEGRATION_SPEC.md` §12.3). The registration form carries its own collection notice and guardian declaration (§7.6).

### 7.2 Behaviour specification

| Aspect          | Specification                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| When it appears | On a visitor's first visit to any public page (`/`, `/login`, `/register`), and again whenever the stored version differs from the current version. Not shown on the Privacy Notice and Terms pages themselves, so people can read them. Not shown to a signed-in user who has a current per-account acceptance                                                         |
| What it blocks  | The redirect from `/` to `/login` and access to `/login` and `/register` until accepted. Nothing outside the pop-up is clickable while it is open                                                                                                                                                                                                                       |
| Controls        | An **unticked** checkbox ("I have read and understood this notice, the Privacy Notice and the Terms of Service") and a primary **Accept and continue** button that is disabled until the box is ticked; a secondary **I do not accept** that closes the pop-up on a plain page explaining that the app cannot be used without accepting and how to contact the operator |
| Links           | Full Privacy Notice and Terms open in a new tab so the pop-up stays                                                                                                                                                                                                                                                                                                     |
| Storage         | `localStorage` key `sms_disclaimer_accepted` holding `{ version, acceptedAt }` (a functional item; list it in the storage notice, Appendix D)                                                                                                                                                                                                                           |
| Versioning      | A constant `DISCLAIMER_VERSION` (and `platform_config/legal.currentTermsVersion` for per-account acceptance); bump on any material change to the Notice, Terms or this text                                                                                                                                                                                             |
| Accessibility   | `role="dialog"`, `aria-modal`, labelled title and description, focus moved into the dialog and trapped, Escape does not dismiss, a visible focus ring, text at least 16 px, readable at 320 px width, no time limit, usable by keyboard and screen reader                                                                                                               |
| Language        | Plain English (reading age about 12 to 14), short sentences; consider Jamaican-context examples; a translation is not required but keep text translatable                                                                                                                                                                                                               |
| Minors          | The pop-up addresses guardians ("If you are under 18, ask a parent or guardian to read this with you and accept for you")                                                                                                                                                                                                                                               |
| Do not          | Pre-tick the box, bury the notice, hide the decline route, set tracking, or use dark patterns                                                                                                                                                                                                                                                                           |

### 7.3 Content requirements (what must be said)

1. Who runs the app and how to reach them (operator name, contact, data protection officer).
2. What the app is: a school management platform used by institutions; each institution creates its people's accounts.
3. What personal data is collected and why, in a sentence each (identity and contact data; student records such as attendance, results and behaviour records; photos; account and security data).
4. **Who sees it:** the institution's staff, the student and linked guardians; the platform operator; named service providers.
5. **Where it goes:** stored on servers outside Jamaica (the United States for Google Firebase), and processed by EmailJS (US) and SMTP2GO (named region) and Vercel (US); that this is a transfer outside Jamaica and what protects it; that accepting is consent to the transfer.
6. **Account emails:** the app sends emails on the institution's behalf from the app's address; they contain a **temporary password** and a sign-in link; replies go to the institution; keep the password private, change it at first sign-in and report unexpected emails.
7. **Children and guardians:** the app handles children's data; a parent or guardian accepts on a child's behalf; how guardians exercise rights.
8. **Retention:** the headline periods or a link to the table.
9. **Rights and complaints:** access, correction, deletion, objection; the contact; the right to complain to the Information Commissioner.
10. **Security and your part:** reasonable protections; use a private device; sign out on shared computers; the app keeps some data in the browser (drafts, preferences).
11. **Cookies and local storage:** only what is needed to run the app; nothing for advertising.
12. **Use of the app:** acceptable use in one line; no guarantees of availability.
13. Links to the full Privacy Notice and Terms; the version and date.

### 7.4 Draft text: Disclaimer (short form, shown in the pop-up)

> **Before you continue**
>
> **[APP NAME]** is a school management service run by **[OPERATOR LEGAL NAME]** ("we"). Your school or institution uses it to look after student, parent and staff accounts and records. We are responsible for how your personal information is handled in the app. You can reach us, and our data protection officer, at **[CONTACT EMAIL]**.
>
> **What we collect and why.** Names, contact details, class and attendance, results and comments, behaviour records, photos, and sign-in and security information. We use it to run your institution's school administration and to keep the service safe. We do not sell it and we do not use it for advertising.
>
> **Who sees it.** Your institution's authorised staff, the student, and linked parents or guardians. Our service providers handle it for us: Google (Firebase), Vercel, and, for account emails, EmailJS and SMTP2GO.
>
> **Outside Jamaica.** Our main servers are in the **United States**, and our email providers also process data outside Jamaica. By accepting, you agree to your information being transferred and processed there. We take steps to protect it, and you can ask us how.
>
> **Account emails.** We may email you on your institution's behalf from our address. These emails can contain a **temporary password** and a sign-in link. Keep them private, change the password when you first sign in, and tell your institution if an email was unexpected. Replies go to the institution.
>
> **Children.** If you are under 18, a parent or guardian must read this with you and accept on your behalf.
>
> **Your rights.** You can ask to see, correct or delete your information, object to its use, or complain to the Office of the Information Commissioner (Jamaica). See the Privacy Notice.
>
> **Using the app.** Use it responsibly and keep your sign-in private. We try to keep the service available but cannot promise it will always work.
>
> Read the full **[Privacy Notice]** and **[Terms of Service]** (version **[VERSION]**, **[EFFECTIVE DATE]**).
>
> ☐ I have read and understood this notice, the Privacy Notice and the Terms of Service, and I agree to them. If I am under 18, a parent or guardian has read them and agrees on my behalf.
>
> [ Accept and continue ] [ I do not accept ]

### 7.5 Draft text: decline screen

> **You have not accepted.** You need to accept to use [APP NAME] because we cannot provide your institution's service without handling the information described. If you have questions, contact **[CONTACT EMAIL]**. [ Review the notice again ]

### 7.6 Public registration form: collection notice and guardian declaration

The registration form collects a child's and two guardians' details from an unauthenticated visitor, so it needs a notice **at the point of collection** and a required declaration (draft in Appendix B):

- what is collected and why (to process an enrolment application for the named institution), who sees it (that institution's admissions staff and the platform), where it is stored (outside Jamaica), how long it is kept if the application is not accepted, and the guardian's rights;
- a required, unticked checkbox: **"I am the parent or legal guardian of the applicant (or I am authorised to apply on their behalf), I have read the Privacy Notice, and I consent to this information being used and transferred as described."**
- do not collect more than needed: question "occupation", "work", and "last school attended" against purpose and make optional what is optional; the photo should be optional with its own consent line.

### 7.7 Login page microcopy

Under the login button: "By signing in you agree to the Terms of Service and Privacy Notice. First time here? You will be asked to confirm them again when you set your own password." A small footer on every public page: "Privacy Notice · Terms of Service · Contact".

---

## 8. The Privacy Notice

### 8.1 Drafting rules

- Write it for a parent of a primary-school child and for a teenager, not for a lawyer: short sentences, headings that are questions, a one-page summary at the top.
- Say what the app **actually** does today. If a promise is not yet true (for example "you can download your data in one click"), do not make it.
- State the **retention periods**, the **countries** data goes to, the **providers by name**, the **rights and deadlines**, and **how to complain to the OIC**.
- Keep a dated version history; update the version when practice changes and prompt re-acceptance when the change is material.
- Provide it in the app (public page, no sign-in needed), linked from the Disclaimer, the registration form, the login page, every email footer and the user's profile.

### 8.2 Structure and draft text

Placeholders in square brackets; text marked **[SOLE-CONTROLLER MODEL]** changes under the fallback in §4.3.

#### 1. Summary (top of page)

> **[APP NAME]** is run by **[OPERATOR LEGAL NAME]**. We handle information about students, parents and staff so that schools can run their records, attendance, results and communication. This notice explains what we collect, why, who sees it, where it goes (including outside Jamaica), how long we keep it, and your rights. Last updated **[EFFECTIVE DATE]**, version **[VERSION]**.

#### 2. Who we are and how to contact us

> We are **[OPERATOR LEGAL NAME]**, of **[OPERATOR ADDRESS]**, registered with the Office of the Information Commissioner as a data controller (registration number **[OIC REGISTRATION NO.]**). We are the **data controller** for the personal information described here. **[SOLE-CONTROLLER MODEL]** Our data protection officer is **[DPO NAME AND CONTACT]**. Contact us at **[CONTACT EMAIL]** or **[POSTAL ADDRESS]**.

#### 3. Whose information we handle

> Students; parents and guardians; teachers and other staff; people who apply to a school through our registration form; and people who visit our website.

#### 4. What we collect

Present as a table by group (adapt from §3.3):

| Group                                      | What we collect                                                                                                                                                                                                                                              | Where it comes from                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Account holders (students, parents, staff) | Name; email; phone numbers; address; role; institution; sign-in details; date of sign-in                                                                                                                                                                     | You, or your institution when it creates your account |
| Students                                   | Date of birth; gender; class and house; student number; photo; attendance (including reasons for absence); results and teachers' comments; behaviour records (merits, demerits, detentions, suspensions and the reason given); report cards; work you submit | Your institution and you                              |
| Parents and guardians                      | Contact details; the students you are linked to; relationship                                                                                                                                                                                                | Your institution and the registration form            |
| Applicants (registration form)             | Student's names, date of birth, gender, email, requested class, last school and optional photo; each guardian's name, address, phone, email, occupation and workplace                                                                                        | The person completing the form                        |
| Staff                                      | Role, department, classes, ID number if you gave one, activity records                                                                                                                                                                                       | You and your institution                              |
| Everyone                                   | Technical information: IP address, browser and device signals (including through Google reCAPTCHA), session records, audit records of changes made to accounts and records                                                                                   | Generated when you use the app                        |

> We do not knowingly collect health records, religious or political information, or biometric identifiers. If a reason for an absence or a behaviour record contains such information, it is kept only to that purpose and limited to people who need it. **[REVIEW with counsel: ID numbers, photos, behaviour records]**

#### 5. Why we use it and our legal basis

| Purpose                                                              | Legal basis                                                                                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Create and run accounts; provide the service to your institution     | Contract; legitimate interests (running the service)                                                                               |
| Keep school records: attendance, results, reports, behaviour records | Consent (of the person or, for a child, a parent or guardian); legitimate interests of the institution and the student's education |
| Process enrolment applications                                       | Consent; steps taken at the applicant's request                                                                                    |
| Send account emails (credentials, notices)                           | Contract; legitimate interests; the email gives notice and links to this notice                                                    |
| Security, fraud and abuse prevention; audit records                  | Legitimate interests; legal obligation                                                                                             |
| Meet legal duties, answer the Commissioner and courts                | Legal obligation                                                                                                                   |
| Transfers outside Jamaica                                            | Consent (and the safeguards in section 8)                                                                                          |

> We do not use your information for advertising, we do not sell it, and we do not make decisions about you by automated means alone.

#### 6. Who sees your information

> Inside the app: your institution's authorised staff (according to their role), the student, linked parents or guardians, and our authorised staff when needed to run or support the service. Outside the app: our service providers (section 7), a court, the police or a regulator when the law requires, and, in the unlikely event of a sale of our business, the buyer under the same protections.

#### 7. Our service providers

Table: Google (Firebase), Vercel, EmailJS, SMTP2GO, Google reCAPTCHA: what each does, what it sees, where. Add: "We have written agreements with these providers that require them to protect your information and use it only for us." **[Only once true.]**

#### 8. Transfers outside Jamaica

> Our main servers are in the **United States** (Google Cloud Firestore, Google Authentication, Google Realtime Database), and our email providers process data in the **United States** (EmailJS) and **[REGION]** (SMTP2GO). Our website host is Vercel (United States). These countries may not give the same legal protection as Jamaica. We transfer your information only (a) with your consent, given when you accept this notice or complete the registration form, and (b) under agreements and security measures designed to protect it **[ADD any Commissioner-approved terms]**. You may withdraw consent, which may mean we cannot provide the service. Ask us for a description of the safeguards.

#### 9. How long we keep it

Table (proposed periods; **decision needed**, see §10.5):

| Data                                          | Kept for                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Account and student record data               | While the institution uses the service and the account is active, then **[X] years** (set per education-record rules)              |
| Applications not accepted                     | **[12] months** after the decision                                                                                                 |
| Behaviour records                             | **[X] years** after the student leaves                                                                                             |
| Audit and activity records                    | **[X] years**, then deleted or anonymised                                                                                          |
| Submitted work (assignments)                  | Until the institution's retention date, then deleted                                                                               |
| Email delivery records at our email providers | EmailJS up to 30 days (we turn request logging off); SMTP2GO about 35 days                                                         |
| Sign-in and security logs at Google           | Authentication IP addresses for a few weeks; session records are removed when the session ends                                     |
| Backups                                       | Deleted copies disappear from backups within **180 days**                                                                          |
| Browser storage                               | Session data is cleared when you close the tab; unsent attendance drafts and display preferences stay on that device until cleared |

#### 10. Children

> Many of the people whose information we handle are under 18. For a child, a **parent or legal guardian** gives consent, receives notices (including account emails for younger children, sent to a guardian) and may exercise the child's rights. We do not market to children and do not use their information for advertising or profiling. **[Confirm the age threshold for guardian-addressed emails (default under 16).]**

#### 11. Security

> We protect your information with access controls by role and institution, encryption in transit and at rest provided by our hosting, abuse protection, session controls, and audit records. No system is perfectly secure. Keep your password private, sign out on shared computers, and tell us at once if you suspect a problem. If a breach affects you we will tell the Information Commissioner and you within 72 hours of becoming aware. **[Do not claim more than the app does; see §10.8.]**

#### 12. Your rights

> You may ask to: see the information we hold about you; correct it; have it blocked or deleted where the law allows; object to or restrict its use; receive it in a portable format; and withdraw consent. We answer access requests within **30 days**. Parents and guardians can exercise a child's rights. We may need to confirm who you are. To make a request, email **[CONTACT EMAIL]**. If you are unhappy with our reply you may complain to the **Office of the Information Commissioner**, Kingston, Jamaica (**oic.gov.jm**).

#### 13. Cookies and local storage

> We do not set advertising or tracking cookies. To run the app we use your browser's storage: to keep you signed in for the tab, remember filters and preferences, keep unsent attendance entries on your device, and speed up pages with short-lived cached data. Google reCAPTCHA helps protect the site from abuse and processes technical data such as your IP address. See the storage table.

#### 14. Links and other sites; changes; contact

> The app may link to other sites we do not control. We may update this notice; for material changes we will tell you in the app and ask you to accept again. Questions: **[CONTACT EMAIL]**.

---

## 9. The Terms of Service

### 9.1 Drafting rules

- Two audiences: **institutions** (customers, who sign an institution agreement) and **individual users** (students, parents, staff, who accept the Terms on the Disclaimer and at first sign-in). Keep one set of Terms with an **Institution Terms** schedule (§9.3).
- Align every promise with the providers' terms (§6): do not promise uptime, delivery or security beyond what Google, Vercel, EmailJS and SMTP2GO give you; mirror their indemnity and "as is" limits where lawful.
- Keep liability limits reasonable and clear; they cannot exclude liability that the law does not allow to be excluded.
- Avoid clauses you cannot honour (for example "all data deleted within 7 days") while backups persist for 180 days.

### 9.2 Structure and draft text

#### 1. Who we are and what these Terms cover

> These Terms are between **[OPERATOR LEGAL NAME]** ("we", "us") and anyone who uses **[APP NAME]** ("you"), including institutions. They cover the website and app and the services around them. If you use the app for an institution you confirm you have its authority to accept these Terms for it.

#### 2. The service

> [APP NAME] helps institutions manage students, staff, parents, timetables, attendance, assessments, behaviour records, lesson material, reports, communication and registrations. We may change, add or remove features. Accounts are created by an institution's administrators; we do not create accounts for individuals directly.

#### 3. Accounts and passwords

> You must give accurate information and keep your sign-in private. New accounts start with a temporary password and must set their own at first sign-in; do not share it. You are responsible for activity under your account. Tell your institution and us at once if you think your account was misused. Passwords may be reset to a standard temporary password when credentials are re-issued; change it immediately.

#### 4. Who may use it (age and guardians)

> The app handles children's information. A student under 18 may use the app only with the knowledge and agreement of a parent or legal guardian, who accepts these Terms and our Privacy Notice on the student's behalf. We may send a young student's account details to a linked guardian instead of the student.

#### 5. Institutions' responsibilities

> An institution promises that: it has the right and authority to give us the information it enters and to have us process it for these purposes; the information is accurate and lawfully obtained; it has told the students, parents and staff concerned that their information is processed in [APP NAME] and where, and has obtained any consent the law requires (including a parent's or guardian's for a child); it gives us a correct institution name and contact email; it limits access to staff who need it and removes access when staff leave; it will not upload unlawful, abusive, discriminatory or infringing material or health records; it will not use the app to send marketing; and it will cooperate with data-subject requests and incident response. **[SOLE-CONTROLLER MODEL: we remain responsible as controller; under the fallback model move the notice and consent duties here.]**

#### 6. Acceptable use

> You must not: break the law; access or try to access data, accounts or systems you are not authorised to use (including guessing or reusing passwords); interfere with or overload the service; probe, scan or test its security without our written permission; forge, spoof or misuse the email feature or send anything that is spam, phishing or unrelated to account administration; copy or resell the service; upload malware; or harass or discriminate. We may suspend or remove accounts and content that breach this section.

#### 7. Emails sent for institutions

> We send account emails on an institution's behalf from our address, with the institution named in the sender name and replies going to the institution. We are only the messenger: the institution is responsible for the content it asks us to send and for having the right to contact the recipients. We do not guarantee delivery, we may limit sending, and we may stop it if it is abused. Emails may contain a temporary password; keep them private.

#### 8. Your content and our licence

> Institutions and users keep ownership of what they upload or enter. You grant us a limited licence to host, copy, display and process it to provide the service. We do not claim ownership of student work, lesson material or records.

#### 9. Privacy and data protection

> How we handle personal information is described in the **Privacy Notice**, which forms part of these Terms. We act as data controller for the information processed through the app **[SOLE-CONTROLLER MODEL]**. We use service providers (Google, Vercel, EmailJS, SMTP2GO) and some process information outside Jamaica; see the Notice.

#### 10. Availability, support and changes to the service

> We aim to keep the service available but provide it **"as is"** and **"as available"** without any service-level guarantee. It depends on third-party services that may be interrupted. We may carry out maintenance, with notice where practicable. Support is by **[CONTACT EMAIL]** during **[HOURS]**.

#### 11. Third-party services

> The service relies on third-party providers whose own terms apply to them. We are not responsible for their outages, changes, policies or acts, except as the law requires.

#### 12. Fees

> **[Describe the plan, fees, billing and refunds; or state that the service is currently provided without charge and may become paid with notice.]**

#### 13. Suspension and termination

> We may suspend or end access for breach of these Terms, risk to the service or other users, non-payment, or where the law requires, with notice where practicable. An institution may end its use by written notice. On termination we will, on request within **[30]** days, make the institution's data available for export; after that we delete or anonymise it as the Privacy Notice describes, subject to legal duties and backup expiry.

#### 14. Intellectual property

> The app, its design and software belong to us or our licensors. These Terms give you a limited, non-exclusive, non-transferable right to use it for its intended purpose.

#### 15. Disclaimers

> To the extent the law allows, we give no warranty that the service will be uninterrupted, error-free or secure, or that emails will be delivered or read. Educational decisions remain the institution's responsibility; the app is a record-keeping aid.

#### 16. Limitation of liability

> To the extent the law allows, we are not liable for indirect or consequential loss, loss of profit, loss of data caused by events outside our reasonable control, or the acts of third-party providers. Our total liability for any claim is limited to **[the fees paid by the institution in the 12 months before the claim / J$ amount]**. Nothing in these Terms limits liability that cannot lawfully be limited.

#### 17. Indemnity

> An institution will indemnify us against claims, losses and costs arising from its breach of these Terms, from information it entered without authority or in breach of law, or from content it asked us to send. **[Counsel: reciprocal wording; mirror the providers' indemnities.]**

#### 18. Force majeure, assignment, notices, severability, entire agreement

> Standard clauses. **[Counsel to supply.]**

#### 19. Changes to these Terms

> We may update these Terms. For material changes we will tell you in the app and ask you to accept again; continuing to use the service after the effective date is acceptance where the law allows.

#### 20. Governing law and disputes

> These Terms are governed by the laws of **Jamaica**. The courts of Jamaica have jurisdiction, subject to **[mediation or other dispute step]**. **[Counsel to confirm.]**

#### 21. Contact

> **[OPERATOR LEGAL NAME]**, **[OPERATOR ADDRESS]**, **[CONTACT EMAIL]**.

### 9.3 Institution Terms (schedule signed or accepted by each institution)

| Clause                        | Content                                                                                                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parties and roles             | Operator and institution; the operator is the controller for the data processed through the app **[SOLE-CONTROLLER MODEL]**; under the fallback the institution is the controller and these clauses become a data-processing agreement |
| Subject matter and duration   | Providing the service for the institution's students, parents and staff for the subscription term plus the wind-down period                                                                                                            |
| Categories of data and people | As in §3.3                                                                                                                                                                                                                             |
| Instructions                  | The institution decides who has accounts and what is entered; the operator processes only to provide, secure and support the service and as the law requires                                                                           |
| Confidentiality and access    | Staff are bound by confidentiality; the institution's admins and teachers see only what their role allows                                                                                                                              |
| Security                      | Measures in §10.8; the institution protects its admin accounts and removes leavers                                                                                                                                                     |
| Sub-processors                | Google (Firebase), Vercel, EmailJS, SMTP2GO, reCAPTCHA listed; notice of changes **[30]** days; right to object                                                                                                                        |
| International transfers       | Disclosed US (and chosen regions) processing; the institution confirms it has told its people and obtained consent where required; the operator supplies the transfer information                                                      |
| Assistance                    | Each side helps the other answer rights requests and regulator queries within the statutory times (30 days for access)                                                                                                                 |
| Breach                        | The operator tells the institution **without undue delay and within [24] hours** of becoming aware, so each side can meet the 72-hour duty; the institution tells the operator immediately of any incident affecting its accounts      |
| Deletion and return           | Export on request within **[30]** days of termination; deletion thereafter; backups expire within 180 days                                                                                                                             |
| Audit                         | The operator provides reasonable information and may share provider certifications; on-site audits by agreement                                                                                                                        |
| Records and cooperation       | Each keeps its records; the institution's own registration duties (if any) remain its own                                                                                                                                              |
| Liability                     | As in the Terms; carve-outs for data-protection breaches **[counsel]**                                                                                                                                                                 |

---

## 10. Operations: checklists, playbooks, retention and records

### 10.1 Checklist before launch (first real student)

1. Operator named; **registered with the OIC** (or a documented decision about whether and when) (§5.6).
2. **Data protection officer** appointed or the decision recorded (§5.6).
3. Counsel has reviewed the controller model (§4), the transfer basis (§5.7), this guide's drafts, and the Notice and Terms.
4. **Privacy Notice, Terms of Service, Disclaimer pop-up** published; registration-form notice and guardian declaration live; per-account acceptance recorded at first sign-in with re-acceptance on version change.
5. **Institution agreement** signed or accepted by every institution (§9.3).
6. Processor terms accepted and filed: Firebase DPST, Vercel DPA, EmailJS DPA, SMTP2GO DPA (§10.7).
7. **Hosting plan** allows commercial use (Vercel Pro).
8. EmailJS request logging **off**; SMTP2GO region chosen and recorded.
9. Retention schedule approved and deletion tooling in place (§10.5).
10. Rights-request and breach playbooks tested once (§10.3, §10.4); a monitored contact mailbox exists for rights requests, provider breach notices and OIC letters.
11. Security gaps in §11 marked P0 closed.
12. Backups or exports scheduled and tested (availability and resilience).

### 10.2 Responsibilities (platform and institutions)

| Task                                                       | Platform (sole controller)                                                                   | Institution                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Registration with the OIC, DPO, annual assessment, records | Owns                                                                                         | Cooperates; keeps its own duties if it is a controller in its own right                                               |
| Privacy Notice, Disclaimer, consent records                | Owns the documents and the acceptance records                                                | Gives guardians the notice at enrolment (a line in its own forms pointing to ours); confirms authority to supply data |
| Accuracy of data                                           | Provides tools                                                                               | Keeps its data accurate; corrects errors                                                                              |
| Access, correction, deletion requests                      | Owns the process and the deadline                                                            | Forwards any request it receives within 2 working days; helps verify the requester                                    |
| Breach notification                                        | Notifies the OIC and data subjects within 72 hours; tells institutions within **[24]** hours | Tells the platform immediately of any account misuse or loss of a device                                              |
| Security of the service                                    | Owns                                                                                         | Protects admin credentials; removes leavers; uses private devices                                                     |
| Account emails                                             | Sends; keeps quotas and the messenger statement                                              | Keeps its name and reply address correct; reads replies                                                               |
| Retention and deletion                                     | Runs the schedule and tools                                                                  | Tells the platform when it leaves; requests export                                                                    |

### 10.3 Breach playbook (72 hours)

| When            | Step                                                                                                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T0, awareness   | Record the time you became aware (the clock starts); alert the DPO and the owner; open an incident log                                                                                                                                                                                                             |
| Within hours    | Contain: disable affected accounts or keys, rotate secrets, revoke tokens, switch the email kill switch if relevant; preserve evidence                                                                                                                                                                             |
| Within 24 hours | Assess: what data, how many people (children?), what harm; tell affected **institutions**; check provider notices (Google, EmailJS, SMTP2GO, Vercel)                                                                                                                                                               |
| **By 72 hours** | **Notify the Commissioner** (OIC breach form) with: facts, nature, categories and numbers affected, likely consequences, measures taken, DPO contact. **Notify each affected data subject** (a guardian for a child) in plain language: what happened, what data, what they should do, what you are doing, contact |
| After           | Fix the cause, update the risk record and the annual assessment, review the Notice, and log lessons learned                                                                                                                                                                                                        |

Templates: Appendix E.

### 10.4 Rights-request playbook

1. **Receive** at **[CONTACT EMAIL]**; log date, requester, type, subject.
2. **Verify** identity (and, for a child, that the requester is the linked guardian); ask only for what is needed.
3. **Locate** the data: user document, photo, guardian links, attendance, results, comments, behaviour records, registrations, audit and activity entries, submissions, email stamps and counters; Auth user; Realtime Database record; provider copies (EmailJS metadata, SMTP2GO logs).
4. **Decide and act** within the deadline: **access 30 days**; restriction notices 21 days (⚠ Verify); correction and erasure promptly. Exceptions: legal duties, defence of claims, other people's data (redact), and audit entries needed for security.
5. **Reply** with the data in a machine-readable file, explain anything withheld, and mention the right to complain to the OIC (templates in Appendix F).
6. **Close** and keep the log for **[3]** years.

### 10.5 Retention and deletion plan

- **Decide** a period for each category (the table in §8.2 section 9 has placeholders); check education-record rules with the Ministry before fixing them.
- **Implement:** a scheduled deletion routine (Admin SDK script, run by the owner, like the existing maintenance scripts) for expired registrations, closed accounts, assignment submissions (a retention date already exists), audit and activity entries past their period, and stale Realtime Database records; log each run.
- **Audit log:** the rules forbid update and delete, so deletion or anonymisation must be done by the Admin SDK. Decide whether to anonymise names in old entries instead of deleting them.
- **On leaving:** when an institution ends, export, then delete its subtree and its users' Auth accounts and photos; confirm backups age out within 180 days.
- **Disposal:** use methods approved by the Disposal of Personal Data Regulations 2024 (⚠ Verify the list).

### 10.6 Records, annual assessment and registers

- **Record of processing:** purpose, categories, recipients and processors, transfers, retention, security measures (the register needed for OIC registration). Start from §3 and §6.5.
- **Annual assessment (due within 90 days of year end):** describe the processing of the year, its necessity and proportionality, the transfers, the safeguards and the incidents. Outline: scope; data and systems; purposes and lawful bases; children's data; transfers; risks and mitigations; incidents; changes planned. Calendar it for **31 March**.
- **Registers to keep:** processors and agreements (with dates), sub-processor notices, consent and acceptance versions, requests, incidents, deletion runs, training.

### 10.7 Vendor management: the four agreements

| Provider        | Action                                                                                                                                                                            | Where                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Google Firebase | Confirm the Firebase Data Processing and Security Terms apply to the project (they are incorporated in the terms); save a copy; note the sub-processor list and the 30-day notice | Firebase console legal and Google's terms page |
| Vercel          | Accept the DPA; upgrade from Hobby to Pro                                                                                                                                         | Vercel dashboard and legal page                |
| EmailJS         | Accept the DPA; switch template request logging off; keep the account active; one account only                                                                                    | EmailJS dashboard (GDPR/FADP pages)            |
| SMTP2GO         | Review the agreement in Settings > Display Settings; choose the region; keep unsubscribe footer off; no archiving                                                                 | SMTP2GO account                                |

Review yearly and whenever a provider announces a change.

### 10.8 The security statement versus what the app really does

| Area                   | What the app does                                                                                                                                        | Gap or note                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Access control         | Firestore rules by institution and role; teachers limited to students and their own audit entries; parents to linked children                            | Review rules with each release; admins within an institution see all its data                                                       |
| Authentication         | Email and password; forced password change at first sign-in; sign-in held in the tab only; single active session per account; institution check at login | **Role default passwords are public** (in the client bundle and docs) and are reused for imports and resets; no multi-factor option |
| Abuse protection       | Firebase App Check (reCAPTCHA v3)                                                                                                                        | Disclose reCAPTCHA; keep App Check enforced in production                                                                           |
| Encryption             | TLS in transit; Google encrypts at rest                                                                                                                  | Say "provided by our hosting"                                                                                                       |
| Audit                  | Permanent audit log of admin and teacher changes; activity log                                                                                           | Retention and erasure conflict (§10.5)                                                                                              |
| Data in the browser    | Query cache in `sessionStorage` (up to 30 minutes); **attendance drafts in `localStorage`**                                                              | Personal data on shared or lost devices; clear drafts after save, expire them, warn on shared computers                             |
| Photos                 | Stored as base64 data URLs in Firestore documents                                                                                                        | Size and exposure; acceptable but note                                                                                              |
| Backups and resilience | No documented backup or export schedule (⚠ Verify)                                                                                                       | Add scheduled exports; test restore                                                                                                 |
| Email                  | Planned: temporary passwords in email; reset script run locally with a service-account key                                                               | Key must stay local; passwords in email are a known risk (mitigated by forced change, short windows, logging off)                   |
| Monitoring             | Firestore usage; none for security events                                                                                                                | Add alerts for unusual access if possible                                                                                           |

Do not claim "bank-level" or "military-grade" security; describe measures factually.

---

## 11. Gaps in the app and recommended changes

Priority: **P0** before any real student data; **P1** before wider rollout; **P2** soon after.

| #   | Gap                                                                                         | Change                                                                                                                                                                                 | Priority |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | No notice or consent on the **public registration form**                                    | Add the collection notice, guardian declaration (required, unticked), optional photo consent, and a link to the Notice; store the declaration with the registration (version and time) | P0       |
| 2   | No **Disclaimer pop-up** or acceptance record                                               | Build the pop-up (§7) and the per-account acceptance at first sign-in with re-acceptance on version change (`EMAIL_INTEGRATION_SPEC.md` §12.3)                                         | P0       |
| 3   | **Privacy Notice, Terms and institution agreement** do not exist                            | Draft from §8 and §9 with counsel; publish public pages; link everywhere                                                                                                               | P0       |
| 4   | **Firestore is in the US**; no transfer decision                                            | Decide the basis (§5.7) **before storing real data**; if moving, create the new database now; add the transfer consent line                                                            | P0       |
| 5   | **Role default passwords are public**                                                       | Replace reused defaults with per-account random temporary passwords, or force the reset flow; stop publishing defaults in docs; reconsider the shared import password                  | P0       |
| 6   | **Vercel Hobby** on a commercial product                                                    | Upgrade to Pro or move host                                                                                                                                                            | P0       |
| 7   | OIC **registration** and **DPO** not done                                                   | Register; appoint                                                                                                                                                                      | P0       |
| 8   | **Attendance drafts in `localStorage`**, query cache in `sessionStorage`                    | Expire and clear drafts; avoid persisting personal data longer than needed; warn on shared devices                                                                                     | P1       |
| 9   | **No data export or erasure tooling**                                                       | Build a per-person export (JSON/CSV) and a deletion routine covering Auth, Firestore, Realtime Database, photos and provider copies                                                    | P1       |
| 10  | **Retention** undefined; audit log permanent                                                | Approve a schedule; add scheduled deletion/anonymisation scripts                                                                                                                       | P1       |
| 11  | **ID number (Citizen ID/TRN)** and registration extras (occupation, workplace, last school) | Make optional or remove unless a legal reason exists; mask in lists                                                                                                                    | P1       |
| 12  | **Guardian rules**: who accepts for a minor; who receives a young student's emails          | Implement the guardian recipient rule and guardian acceptance (EMAIL spec §5.3, §12.3)                                                                                                 | P1       |
| 13  | **Disciplinary reasons** are free text                                                      | Add guidance and a length limit; restrict visibility; consider structured categories                                                                                                   | P1       |
| 14  | **EmailJS** logging and key exposure                                                        | Logging off; domain allowlist; server-function trigger (EMAIL spec §15)                                                                                                                | P1       |
| 15  | **reCAPTCHA disclosure**                                                                    | State in the Notice and on login/registration                                                                                                                                          | P1       |
| 16  | **Breach and rights playbooks, records, annual assessment**                                 | Create the registers and calendar the annual assessment                                                                                                                                | P1       |
| 17  | **Backups/exports**                                                                         | Scheduled export of Firestore; restore test                                                                                                                                            | P1       |
| 18  | No **MFA**                                                                                  | Offer for admin roles                                                                                                                                                                  | P2       |
| 19  | Security-event **monitoring**                                                               | Alerts for repeated failures or unusual admin activity                                                                                                                                 | P2       |
| 20  | **Accessibility and plain-language review** of the three documents                          | Reading-age test; screen-reader test of the pop-up                                                                                                                                     | P2       |

---

## 12. Open questions and placeholders

### 12.1 Placeholders used in the drafts

`[APP NAME]`, `[OPERATOR LEGAL NAME]`, `[OPERATOR ADDRESS]`, `[POSTAL ADDRESS]`, `[CONTACT EMAIL]`, `[DPO NAME AND CONTACT]`, `[OIC REGISTRATION NO.]`, `[EFFECTIVE DATE]`, `[VERSION]`, `[REGION]` (SMTP2GO), `[X] years` (retention), `[30]` / `[24]` (days and hours), `[HOURS]`, fee and liability amounts.

### 12.2 Decisions and facts still needed

1. Who is the operator (individual, partnership, company), where, and what contact details? Is the OIC registration done?
2. Is the **sole-controller** model confirmed by counsel, or is the fallback needed (§4.3)?
3. How will the **US transfer** be justified (consent, contract, approved terms, move)? Is a new Firestore location acceptable before launch?
4. Who is the DPO?
5. Retention periods per category, after checking Ministry rules.
6. The age thresholds: guardian-addressed emails (default 16) versus 18; who accepts the Terms for a student.
7. SMTP2GO region; whether archiving stays off.
8. Hosting: Vercel Pro or another host.
9. Governing law, courts and any dispute step; liability cap; fees.
10. Whether any institution is a public authority (Access to Information Act, DPO).
11. Whether Firebase Analytics or any other tracking will ever be used (this guide assumes not).
12. The Realtime Database location and the `sms_session_id` storage type (verify in code).
13. Reconcile `EMAIL_INTEGRATION_SPEC.md` with the sole-controller model (lawful basis, consent and notice).

---

## 13. Glossary

| Term                        | Meaning                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| **The Act**                 | Jamaica's Data Protection Act, 2020                                                                |
| **OIC**                     | Office of the Information Commissioner (the regulator)                                             |
| **Controller / processor**  | Decides purposes and means / processes on a controller's behalf                                    |
| **Data subject**            | The person the data is about                                                                       |
| **Minor**                   | Under 18                                                                                           |
| **Sensitive personal data** | The Act's special categories (§5.2)                                                                |
| **DPO**                     | Data protection officer                                                                            |
| **DPA / DPST / DPF**        | Data processing agreement / Firebase's Data Processing and Security Terms / Data Privacy Framework |
| **SCC**                     | Standard Contractual Clauses                                                                       |
| **Transfer**                | Sending personal data to a place outside Jamaica                                                   |
| **Messenger statement**     | The line in each email saying the app only delivers the institution's message                      |
| **Spark**                   | Firebase's free plan                                                                               |
| **TRN**                     | Jamaican Taxpayer Registration Number                                                              |

---

## 14. Appendices

### Appendix A. Disclaimer text

See §7.4 (short form) and §7.5 (decline screen).

### Appendix B. Registration form: collection notice and declaration

> **Applying to [INSTITUTION NAME]**
>
> The information you enter here is collected by **[OPERATOR LEGAL NAME]** (the operator of [APP NAME]) so that **[INSTITUTION NAME]** can consider your child's application. It includes the applicant's and the parents' or guardians' names, contact details, the applicant's date of birth and gender, and, if you choose, a photo. It is seen by that institution's admissions staff and by us, stored on servers outside Jamaica (the United States) and handled by our service providers. We keep applications that are not accepted for **[12]** months. You can ask to see, correct or delete this information, and you can complain to the Office of the Information Commissioner. Read the full **[Privacy Notice]**.
>
> ☐ I am the parent or legal guardian of the applicant (or authorised to apply for them). I have read the Privacy Notice and I consent to this information being used for this application and sent and stored outside Jamaica as described.
>
> ☐ (Optional) I consent to a photo of the applicant being stored and shown to the institution's staff.

### Appendix C. Email footer and welcome-email privacy line

> _This message was sent by [APP NAME] on behalf of [INSTITUTION NAME]. [APP NAME] only delivers it. [INSTITUTION NAME] is responsible for your account. Replies go to [INSTITUTION NAME] at [REPLY-TO ADDRESS]. If you did not expect this email, contact them. Your information is handled by [APP NAME] and its providers (including EmailJS and SMTP2GO, outside Jamaica); see our [Privacy Notice] and [Terms of Service]._

### Appendix D. Storage and cookie notice (short)

> We do not use advertising or tracking cookies. Your browser's storage is used to keep you signed in for the tab, remember filters and preferences (theme, sidebar), keep unsent attendance entries on your device until you save them, store short-lived cached data to speed up pages, and remember that you accepted this notice (version and time). Google reCAPTCHA protects the site from abuse and processes technical data such as your IP address. You can clear browser storage at any time; you may then be asked to accept the notice again.

### Appendix E. Breach notification templates

**To the Information Commissioner (summary of required content):** who we are and our registration number; date and time of the breach and of awareness; nature of the breach; categories and approximate number of people and records; likely consequences; measures taken and planned; DPO contact. (Use the OIC's prescribed form, ⚠ Verify its number and fields.)

**To an affected person or guardian:**

> **Important: a security incident affecting [your / your child's] information in [APP NAME]**
>
> On **[DATE]** we found that **[WHAT HAPPENED]**. The information involved was **[DATA]**. We have **[ACTIONS TAKEN]**. To protect yourself you should **[ADVICE, for example change your password]**. We have told the Office of the Information Commissioner. You can contact **[DPO NAME]** at **[CONTACT EMAIL]** with questions. We are sorry this happened.

### Appendix F. Rights-request reply templates

**Acknowledgement:** "We received your request on [DATE] and will reply by [DATE, within 30 days for access]. To protect your information we need to confirm who you are: [WHAT WE NEED]."

**Access response:** "Attached is the information we hold about [NAME], in [FORMAT]. It covers [SUMMARY]. We have not included [WITHHELD ITEMS] because [REASON]. You may ask us to correct anything inaccurate. If you are unhappy with this reply you may complain to the Office of the Information Commissioner."

### Appendix G. Sources and access dates (all accessed 2026-10-03)

| Topic                                                                       | Source                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The Act (text; not readable by the tool)                                    | `https://japarliament.gov.jm/attachments/article/339/The%20Data%20Protection%20Act,%202020.pdf`                                                                                                                                                                                                              |
| OIC: obligations of data controllers; data protection standards             | `https://oic.gov.jm/content/what-are-obligations-data-controllers`, `https://oic.gov.jm/page/data-protection-standards`                                                                                                                                                                                      |
| Law-firm summaries                                                          | `https://myersfletcher.com/standards-for-processing-personal-data/`, `https://dunncox.com/articles/understanding-data-protection-standards-part-3/`                                                                                                                                                          |
| Practice guides                                                             | `https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/jamaica`, `https://www.recordinglaw.com/world-laws/world-data-privacy-laws/jamaica-data-privacy-laws/`                                                                                                                     |
| Child Care and Protection Act, Electronic Transactions Act, Cybercrimes Act | `https://laws.moj.gov.jm/library/statute/the-child-care-and-protection-act`, `https://icta.gov.jm/wp-content/uploads/2025/08/Electronic-Transactions-Act-Jamaica.pdf`, `https://www.coe.int/en/web/octopus/country-wiki-ap/-/asset_publisher/CmDb7M4RGb4Z/content/jamaica`                                   |
| Firebase                                                                    | `https://firebase.google.com/support/privacy`, `https://firebase.google.com/terms`, `https://firebase.google.com/terms/data-processing-terms`, `https://cloud.google.com/terms`, `https://firebase.google.com/docs/firestore/locations`, `https://firebase.google.com/docs/app-check/web/recaptcha-provider` |
| reCAPTCHA FAQ                                                               | `https://docs.cloud.google.com/recaptcha/docs/faq`                                                                                                                                                                                                                                                           |
| Vercel                                                                      | `https://vercel.com/legal/privacy-policy`                                                                                                                                                                                                                                                                    |
| EmailJS (supplied PDFs)                                                     | `internal/regarding-emailjs/policies/privacy-policy.pdf`, `terms-of-service.pdf`, `new-federal-act-on-data-protection.pdf` (live: `https://www.emailjs.com/legal/privacy-policy/`, `.../terms-of-service/`, `.../nfadp/`)                                                                                    |
| SMTP2GO                                                                     | `https://www.smtp2go.com/terms/`, `https://www.smtp2go.com/blog/security-and-privacy-at-smtp2go/`, `https://www.smtp2go.com/blog/know-your-sending-limits/`, `https://support.smtp2go.com/hc/en-gb/articles/12974008254873-EU-Data-Center`, `https://developers.smtp2go.com/docs/smtp-relay`                 |

**Reliability note.** The Act's wording came through summaries; provider pages were read as rendered text or, for EmailJS, as printed pages; some SMTP2GO support articles were unavailable. Treat every ⚠ Verify as an open task.
