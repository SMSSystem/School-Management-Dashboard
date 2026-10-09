# Institution Login Emails — First-Login and Forgot Password Emails Sent Through the Institution's Own EmailJS

> **Status:** Planned — not yet implemented (spec written before code, per this repo's standing convention). Written 2026-10-05 on branch `email-feat-investigation`; revised the same day (path-only link with an institution slug, Forgot Password confirmation modal, app-icon logo, Self and Guardian templates), then a third time after a consistency review (role-default marker, required date of birth, read-only sign-in email, slug rules, public-endpoint limits, Google Workspace mailbox), and a fourth time after a second review (Forgot Password closed until configured, sender checks at approval, one template with conditional sections, no allowed-domains list assumed, request expiry and cleanup, an approval verification tick, App Check rollout, EmailJS plan facts and capacity).
> **Feature:** An institution that **already has its own EmailJS account connected to its own mailbox** (today: **GENR8-3D Academy**) emails its staff, students and parents (1) a **first-login email** with a link that opens the login page for that institution, and (2) a **Forgot Password email** after an administrator-approved reset. The email is sent **from the institution's own address**, through the institution's own EmailJS service, from the browser of an `institution_admin`.
> **Relationship to the other spec:** [`EMAIL_INTEGRATION_SPEC.md`](EMAIL_INTEGRATION_SPEC.md) (one platform sender, SMTP2GO relay, one shared quota) is **kept untouched for the future**. This spec is the smaller, nearer case: one institution, its own EmailJS account, no relay, no platform sender, no shared quota. Where the two differ, this spec wins for this feature. Moving to the platform-sender model later changes only the sender-resolution step (§3, `resolveEmailSettings()`), not the link, the request flow or the templates.
> **Routes:** `/login/:slug/:role` and `/login/:slug` (new; `/login` is unchanged), `/password/forgot` and `/password/forgot/:slug` (new, public), `/dashboard/password-requests` (new, admin). **No query parameters and no URL fragments are used anywhere in this feature.**
> **Files (new):** `src/lib/loginEmail/` (settings, eligibility, link builder and parser, payload builders, `sendEmail()`, usage counter), `src/lib/roleDefaultPasswords.ts` (shared defaults), `src/lib/institutionSlug.ts` (`suggestSlug`, `validateSlug`, `findFreeSlug`), `src/scenes/(auth)/forgot-password/index.tsx` and `ForgotPasswordConfirmModal.tsx`, `src/scenes/(dashboard)/password-requests/index.tsx`, `scripts/process-password-requests.mjs`, `scripts/backfill-institution-slugs.mjs`, `scripts/audit-account-emails.mjs` (report and `--fix`), `scripts/cleanup-password-requests.mjs` (expires and deletes old requests, §6.4), `src/lib/loginEmail/limits.ts` (the usage-alert constants), an "Email settings" card with a request counter (super_admin), a "Confirm standard password" dialog and a guardian picker dialog (institution_admin). **Files (edited):** `src/scenes/(auth)/login/index.tsx`, `src/App.tsx`, `src/components/forms/InstitutionForm.tsx` (a suggested, editable "Link name" field), `src/scenes/(dashboard)/institution-profile/index.tsx` (the one-time "Link name" field for an institution that has none, and the read-only link block with Copy buttons for an `institution_admin`), `src/components/forms/AdminCreateUserForm.tsx` (writes the role-default marker), `src/components/forms/StudentForm.tsx` and `ParentForm.tsx` (sign-in email read-only and not clearable; the Student form also requires and protects the date of birth; `TeacherForm.tsx` has no email field), `src/lib/importStudents.ts` and `src/scenes/(dashboard)/import/index.tsx` (date of birth required; marker), the Students, Teachers and Parents list pages (the Students list adds the "Missing date of birth" badge and filter), `src/lib/sidebarNav.ts` and `src/lib/__tests__/sidebarNav.test.ts`, `src/lib/profileEditDiff.ts` and its test, `scripts/reset-role-default-passwords.mjs` and the seed scripts (they write the role-default marker and a date of birth), `e2e/00-setup-custom-institution.spec.ts` (the new Link name), `src/lib/firebase.ts`, `firestore.rules`, `firestore.indexes.json`, `.env.example`.
> **Roles:** Sending the first-login email and approving or sending Forgot Password — `institution_admin` (own institution). Email settings (EmailJS ids, Reply-To, caps), the test send, opening the Forgot password form for the first time, institution slugs, and running the reset and cleanup scripts — `super_admin`. Receiving — students, parents and teachers (a student under the guardian-age threshold through a linked guardian). Not for `institution_admin` or `super_admin` accounts (no default password).
> **Does not build:** self-service password resets (a browser cannot set another person's password; §6.1), automatic sign-in from the link (rejected, §4.1), the confirmation email after the first password change, any platform-wide sender.

---

## MVP status (built 2026-10-10, branch `quick-email-feat`)

A small slice of this spec is built first so GENR8-3D Academy can email first-login links; everything not listed here is still **planned, not built**. Owner decisions for the slice:

| Topic | MVP decision (differs from the full design below) |
| --- | --- |
| Link | `/login/<institutionId>/<role>` with the institution's **Firestore id** (no slug, no backfill) and a role code `student`, `teacher` or `spectator` (no `parent`). No password in the link: the login page looks the role's default up in code (`src/lib/roleDefaultPasswords.ts`). |
| Login page | `LoginPage` reads the route params; first-login mode hides the password box, signs in with the role default, and on a wrong password shows the normal box with "That didn't work…" (not counted as a failed attempt); "I already have my own password" link; an unknown institution id or role code is the normal login. |
| Recipients | Senior and regular teachers, students and spectators, one at a time from the Students, Teachers and Spectators lists (`SendLoginEmailButton`, institution admin only). Parents, guardian emails and bulk send are not built. |
| Eligibility | `mustChangePassword === true`, active, a usable address, 24-hour cooldown and a 12-email lifetime cap (`credentialsEmailedAt`, `credentialsEmailCount` on `users/{uid}`), checked on a fresh read of the account. There is **no** `passwordIsRoleDefault` marker and no confirm tick: the fallback above covers a wrong guess. |
| EmailJS ids | `institutions/{id}/email_settings/config` (`enabled`, `emailjs.publicKey/serviceId/templateId`, `portalName`, optional `replyTo`, optional `logoUrl` (an https address that replaces the app icon in the email)), **created by hand in the Firebase console**; readable by that institution's admin and `super_admin`, no client writes (`firestore.rules`). No settings form, test send, usage counter or failure pause. |
| Switch | `VITE_EMAIL_ENABLED="true"` and `VITE_APP_URL` must both be set (production only); otherwise the button is not shown, so dev, previews and e2e never send. |
| Spectator password | **Reversed:** the spectator now has a shared default password (`Spectator0123456789`), like a student, so the link can work. Until its first sign-in anyone who knows a spectator's address can sign in to a role that reads everything an institution admin reads. Accepted by the owner. `SPECTATOR_ROLE_SPEC.md` D13 is superseded. |
| Not built | Slugs, Forgot Password and its script, the marker, date-of-birth rules, the read-only sign-in email, App Check enforcement, usage alerts, the audit-account-emails script. |

**Before the first real send:** (1) connect the Gmail service and create the one template in EmailJS (start from `internal/regarding-emailjs/templates/regarding-welcome-template.md`; it receives `to_email`, `to_name`, `portal_name`, `role_label`, `login_url`, `logo_url`, `reply_to`, `subject`); (2) set `VITE_APP_URL` and `VITE_EMAIL_ENABLED` in Vercel Production; (3) create the settings document in the console; (4) **deploy the Firestore rules** (`firebase deploy --only firestore:rules --project school-sms-v1`).

## 1. Overview and decisions

Accounts are created by admins with a **role default password** and `mustChangePassword: true` (`ROLE_DEFAULT_PASSWORDS`: student, parent, teachers; the bulk import uses the same student value). Today the admin hands over the address, the password and the instructions by hand, and the person has to find their institution in a dropdown. This feature emails the person a link that does most of that for them, and gives people who forgot their password a way to ask their administrator for help from the login page.

| Question                     | Decision                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sender                       | The **institution's own mailbox** through the **institution's own EmailJS account** (From name and From address come from the EmailJS service; Reply-To from `{{reply_to}}`). The platform sends nothing.                                                                                                                                            |
| Link                         | **Option A, path-only:** `<VITE_APP_URL>/login/<slug>/<role>`. The institution is preselected, the **password box is hidden but pre-filled** with the role's default password, and the person only types their **email address**. If that sign-in fails (the password was already changed) the **normal login with a visible password box** appears. |
| No query or fragment         | Both institution and role travel as **path segments**, so no mail program, link wrapper or redirector can drop them.                                                                                                                                                                                                                                 |
| Automatic sign-in (option B) | **Rejected** (§4.1).                                                                                                                                                                                                                                                                                                                                 |
| Password in the email        | **Not printed.** The link carries only a role code (no secret: the role defaults are already in the public bundle). Emails go only to accounts that are **at the role default**.                                                                                                                                                                     |
| After the link               | The person signs in and lands on the existing "Set a new password" screen (`Protected.tsx` renders `ChangePasswordPage` while `mustChangePassword` is `true`).                                                                                                                                                                                       |
| Institution slug             | Each institution gets a unique, **immutable**, human-readable `slug` (for example `genr83d-academy`) used in links. **Suggested from the institution's name** on the Create Institution form, **required** on Create Institution, editable until saved, checked for clashes as the `super_admin` types, then permanent (§3.1, §9).                   |
| EmailJS ids                  | Stored in `institutions/{id}/email_settings/config` (own document, own rules), written by `super_admin`; the institution's admins read it to send.                                                                                                                                                                                                   |
| Forgot Password: entry       | A **Forgot password?** link, always visible under the login form, opens `/password/forgot/<slug>` (or `/password/forgot` with an institution selector). Nothing forgot-password-related is submitted from the login form.                                                                                                                            |
| Forgot Password: request     | The person types their **email** and an optional **note to the administrator** (200 characters), presses **Submit**, and a **warning modal** with an "I understand" tick-box appears; only **Continue** writes the request (§6.2).                                                                                                                   |
| Forgot Password: approval    | An `institution_admin` **approves**; the `super_admin` runs a **local script** that resets the password to the role default and sets `mustChangePassword: true`; the `institution_admin` then **sends the email**. No second approval: the script run is the second step. Approving needs a **verification tick** (§6.2), and a request left open **expires after 14 days** (§6.4).                                                                            |
| Recipients                   | Students, parents and teachers; a student **younger than `guardianAgeThreshold`** (default 16) is emailed at a **linked guardian**. Admin accounts are excluded.                                                                                                                                                                                     |
| Templates                    | **One** EmailJS template with conditional sections serves the account holder (Self) and a guardian, and both email types; the wording that differs is passed as variables (§7). The second free template stays spare.                                                                                                                                                         |
| Email logo                   | Always the **app icon** (`/apple-touch-icon.png`, 180 px PNG) shown at 48 px (§7.2).                                                                                                                                                                                                                                                                 |
| Limits                       | 24 hours between emails to one account; 12 emails per account for life; a monthly counter against the institution's own EmailJS allowance (default 200) with an 80% warning; a per-institution on/off switch; a pause after 3 failures in a row.                                                                                                     |

### 1.1 Decisions added by the first consistency review

| Topic                             | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Where        |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Mailbox                           | GENR8-3D Academy's mailbox is **Google Workspace on a custom domain**, connected to EmailJS through its Gmail service                                                                                                                                                                                                                                                                                                                                                | §8.1, §11    |
| Is the password the standard one? | Stored on the account as `passwordIsRoleDefault`; an `institution_admin` can **confirm** it once per account; an unknown account is not sendable until confirmed                                                                                                                                                                                                                                                                                                     | §3, §5.1     |
| Date of birth                     | **Required from now on** for every student: forms, bulk import, Student edit form and Firestore rules; a student **without one is blocked** from emails; legacy students are flagged and fixed by editing or re-importing                                                                                                                                                                                                                                            | §5.4, §9     |
| Sign-in email                     | The `email` field is **read-only on edit** in the Student and Parent forms (the Teacher form has no email field) and can no longer be blanked, with an owner-run audit script for existing mismatches                                                                                                                                                                                                                                                                                                                          | §5.5         |
| Guardian check                    | Evaluated **when the admin clicks Send**, not per row when the list opens                                                                                                                                                                                                                                                                                                                                                                                            | §5.2         |
| Public Forgot Password endpoint   | Gated by a public `forgotPasswordOpen` flag on the directory entry, **closed until the email setup is tested** (and a kill switch without a deploy) and by Firestore App Check enforcement; what is and is not bounded is stated in §8.1                                                                                                                                                                                                                                                                             | §8.1, §9     |
| Slug rules                        | A slug is set **once**, by `super_admin`, tied to its reservation with `getAfter()`, and **never changed by anyone** afterwards; suggestions are cut at 36 characters                                                                                                                                                                                                                                                                                                | §3, §3.1, §9 |
| Reset script                      | Skips a request when the person **signed in after the request was made**                                                                                                                                                                                                                                                                                                                                                                                             | §6.2         |
| Account-email audit               | The audit script gains `--fix`: **Auth is correct**, only `users.email` is rewritten, dry run by default, `--live` to write, `--institution` scope, a backup log and an `account_email_corrected` audit entry per fix                                                                                                                                                                                                                                                | §5.5         |
| Usage alert                       | Spark cannot alert, so: a **daily console routine** at **70% of the daily write quota (14,000 writes)** with a close-for-everyone step at 90%, plus an **in-app request counter** (on the Password requests page for an `institution_admin`, and on the Email settings card for the `super_admin`) that turns amber at **30 requests an hour** for one institution, with a **Close / Reopen** button and a confirm dialog; the automatic circuit breaker is deferred | §8.1, §16    |

### 1.2 Decisions added by the second review

| Topic | Decision | Where |
| --- | --- | --- |
| Forgot Password gating | The public form is **closed until the email setup exists and a test send has succeeded**; the first opening is a `super_admin` action | §3, §8.1, §9, §11 |
| Approval checks the sender | Approving also checks that the institution can send (enabled, configured, no pause, allowance for the approved backlog); the reset script checks the cooldown and lifetime cap before resetting, so no reset is made that cannot be emailed | §5.1, §6.2 |
| Approval verification | Approving needs a tick, "I have checked that this is the account holder", and a method; recorded on the request | §6.2, §3 |
| Expiry and retention | A request left open **expires after 14 days**; closed requests are **deleted after 90 days** by an owner-run script; the form carries a collection notice | §6.4, §10 |
| Heartbeat | Every admin can read `platform_config/password_script`, so the Password requests page can show when the script last ran | §6.3, §9 |
| EmailJS allow-list | **No allowed-domains list is assumed** (listed under the paid plan); reCAPTCHA v2 is not used; the public key is treated as public | §8, §8.2, §11 |
| Templates | **One** template with conditional sections (`is_guardian`) replaces the two-template Self/Guardian design | §7, §3 |
| App Check | Enforcement is rolled out in stages (watch the verified ratio, debug tokens for dev, e2e and previews, a rollback step) | §8.1, §11 |
| Link without a role | `/login/<slug>` opens the normal form with the institution preselected | §4.2, §4.3 |
| Email settings | A **Send test email** button, and the settings card's fields and validation are defined | §11, §8.2 |
| Capacity | Expected volumes against EmailJS's 200 a month, and the upgrade trigger | §8.2 |
| Controller model | **Left open for counsel**: the compliance guide says the platform is the sole controller, this spec's first draft said the institution | §10 |

---

## 2. Findings: how this fits the existing code

- **Login (`src/scenes/(auth)/login/index.tsx`)** has no URL parameters. It starts on a "choice" view, then `LoginFormView`. The Institution `<select>` is filled from `fetchAllInstitutions()` (the public `registration_directory`, which carries `name` and `logoUrl`). The **Email and Password inputs render only after an institution is selected.** "Forgot password?" is an inert `<span>` beside the Password label; after three failures a hint says "Contact your administrator".
- **`AuthContext.signIn`** is plain `signInWithEmailAndPassword`. Sign-in lives in the tab's `sessionStorage` (`browserSessionPersistence`), so a link always opens a **signed-out** tab, which is what this design wants. One active session per account (an RTDB lock, released by `onDisconnect`).
- **`PostLoginInstitutionGate`** is the element of the `/login` route. After sign-in it consumes `sms_pending_login_institution` and signs the person back out if their account belongs to another institution. The new `/login/:slug/:role` route renders **the same gate**, and the link flow **must write the pending institution before calling `signIn`** (the existing form already does); otherwise the check is skipped.
- **`Protected.tsx`** renders `ChangePasswordPage` for any account whose `mustChangePassword` is `true`, so a successful sign-in from the link lands on **"Set a new password"** with no further work.
- **Firestore rules.** The owner can only _clear_ `mustChangePassword` (`passwordFlagOk`); nothing in the browser can set it back to `true` or reset another person's password, so **Forgot Password needs the Admin SDK**: the locally-run script, modelled on `scripts/reset-role-default-passwords.mjs` (role default, `mustChangePassword: true`, refresh tokens revoked, `password_reset` audit entry). `institutions/{id}` allows `update` for the institution's admin with **no field restriction**, so EmailJS settings live in their own subdocument. `registration_directory` is public (and writable by that institution's admin); `institutions/{id}` is not, so **an unauthenticated visitor cannot read the EmailJS ids** and Forgot Password cannot send by itself.
- **Institution ids are random.** `InstitutionForm.tsx` creates institutions with `doc(collection(db, 'institutions'))`, a 20-character Firestore id; a link built on it would be unreadable. A **slug** is added (§3). The form already writes the institution and its `registration_directory` entry in **one batch** (merge write), and `RegistrationDirectoryToggle` merges into the entry too, so a slug set at creation survives those later writes.
- **The login page already loads the whole directory** (`fetchAllInstitutions()`, cached per tab), so resolving a slug to an institution needs **no extra read**.
- **Vercel** serves `public/` files before applying its catch-all rewrite (`vercel.json`: `/(.*)` → `/`), so `/apple-touch-icon.png` is a real, public URL, and path routes such as `/login/<slug>/student` reach the SPA.
- **The app's icon files** are in `public/`: `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png` (180 px) and `logo.png` (200 px), all the same globe-with-graduation-cap art.
- **Accounts are created in three places** with the role default and `mustChangePassword: true`: `AdminCreateUserForm.tsx` (password pre-filled with the role default but **editable**), the bulk student import (`SHARED_STUDENT_IMPORT_PASSWORD`), and seed scripts. The role defaults already exist in three places kept in sync by hand (the form, the import page, `scripts/reset-role-default-passwords.mjs`); this feature needs them in the **login scene** too, so they move to `src/lib/roleDefaultPasswords.ts` (§4.3).
- **List rows are hand-built** (each list page maps its own row type); the rows must be extended with `mustChangePassword`, `passwordIsRoleDefault`, `credentialsEmailedAt`, `credentialsEmailCount`, `emailInvalid` and, on the Students list, `dateOfBirth` (the same way `phone2` and `idNumber` once were).
- **Not present:** `@emailjs/browser` (the spec uses a plain `fetch` to EmailJS's REST endpoint behind one wrapper), any `/password/*` route, any `/login/*` route, any slug, any email code.
- **`mustChangePassword` does not mean "at the role default".** `AdminCreateUserForm` sets it to `true` for every new account but lets the admin **edit** the pre-filled password, and nothing records whether it was edited. A role-default marker is therefore added (§3, §5.1).
- **Date of birth is only half-required today.** The Create User form already requires it for students (and a minimum age of 3); the public registration form and its rules require it. The bulk import column (`required: false`), the Student edit form (optional) and the `users` rules do not. `dateOfBirth` is an ISO `YYYY-MM-DD` **string**, optional on `UserDocument`, so legacy students can have none (§5.4).
- **The sign-in email can drift.** The Student, Parent and Teacher edit forms let an admin change `email`, which updates the Firestore document only, not the Firebase Auth address people sign in with. The Forgot Password lookup and the `account_email` shown in emails would then be wrong (§5.5).
- **A guardian is found through `student_parents`** (document id `{parentId}_{studentId}`, fields `parentId`, `studentId`, `institutionId`), readable by teachers and above in the institution; the parent's address is on the parent's `users` document (readable by admins). There is no per-student guardian field (§5.2).
- **Spark has no overage.** After about 20,000 writes in a day, writes stop until the daily reset, so any unauthenticated write path is also a way to switch off writes for the whole app (§8.1).
- **The audit rules list event types literally.** The `create` rule for `institutions/{id}/audit_log` allows an `institution_admin` or `super_admin` only the listed types (`role_change`, `password_reset`, … `lesson_note_edit`) and a teacher only four; a new type is refused until it is added to that list (§10.1).
- **`TeacherForm` has no email field; `StudentForm` and `ParentForm` have an optional one** that can be saved blank (it then writes `email: null`), which is the real way a document address drifts from the Auth address. `profileEditDiff.ts` lists `email` in `STUDENT_EDIT_FIELDS` and `PARENT_EDIT_FIELDS`, and its test compares them with the forms (§5.5).
- **`scripts/reset-role-default-passwords.mjs` writes only `mustChangePassword: true`** (and the audit entry), not the marker, so accounts it resets would stay "unknown" until confirmed; it is updated like the new script (§3).
- **`e2e/00-setup-custom-institution.spec.ts` creates its institution through the real `InstitutionForm`**, so the required Link name must be filled or auto-suggested and checked ("Available") before submit (§13).
- **App Check is initialised only when a site key is set, with a debug token for DEV builds only** (`src/lib/firebase.ts`, whose own comment says enforcement should flip on only once every environment has a working configuration); enforcement therefore affects local development, e2e runs, Vercel previews and users whose reCAPTCHA fails (§8.1).
- **EmailJS facts checked on its documentation** (§8.2): templates support conditional sections (`{{#var}}`, `{{^var}}`); double braces escape HTML; the Free plan is 200 requests a month, 2 templates, 7-day data retention, 50 KB, one request per second; the pricing page lists the **whitelist** under the Personal plan and reCAPTCHA support is **version 2 only**; EmailJS reserves the variable names `user_os`, `user_ip`, `user_platform`, `user_browser`, `user_version`, `user_country` and `user_referrer`.
- **The sidebar is data-driven** (`sidebarNav.ts`, `visible` role arrays, a per-role unit test), so the Password requests entry and its test are part of the change (§14).

---

## 3. Data model

```ts
// institutions/{id}  and  registration_directory/{id}   (new optional field on both)
slug?: string;                    // /^[a-z0-9]+(-[a-z0-9]+)*$/, 3-40 chars; unique; set once (only while absent) by super_admin; never changed or removed afterwards by anyone

// registration_directory/{id}   (new optional field; public, so the login page can read it)
forgotPasswordOpen?: boolean;     // true = the public Forgot password form is open; absent or false = CLOSED. super_admin sets it true for the first time only after the email settings exist and a test send succeeded (§8.1); afterwards an admin can close and reopen it

// institutions/{id}   (new optional fields; private, so who closed the form is not on a public document)
forgotPasswordClosedBy?: string;      // uid of the admin who closed the form; cleared on reopen
forgotPasswordClosedAt?: Timestamp;   // when; cleared on reopen

// institution_slugs/{slug}   (new, top-level; one reservation document per slug)
type InstitutionSlug = { institutionId: string; createdAt: Timestamp };   // doc id IS the slug; create-only

// institutions/{id}/email_settings/config   (new; super_admin writes, that institution's admins read)
type InstitutionEmailSettings = {
  enabled: boolean;               // on/off for the whole feature at this institution; institution_admin may switch it
  emailjs: {
    publicKey: string;            // not secrets, but visible in the admin's browser traffic
    serviceId: string;
    templateId: string;           // the one "Login email" template (conditional sections serve Self and Guardian, §7.4)
    guardianTemplateId?: string;  // optional fallback only if conditional rendering proves unreliable (§7.4)
  };
  replyTo?: string;               // valid address; defaults to institution.email
  portalName: string;             // shown in the template ("GENR8-3D Academy Portal"); app display name
  monthlyLimit: number;           // the institution's own EmailJS allowance (200 on free)
  periodStartDay: number;         // the EmailJS billing day (1-31, clamped to the month's last day)
  guardianAgeThreshold: number;   // default 16
  testedAt?: Timestamp;           // last successful "Send test email" (§11); the Forgot password form cannot be opened before it; cleared whenever the EmailJS ids or the template are edited (§11)
  testedBy?: string;              // uid of the super_admin who ran it
};

// institutions/{id}/email_usage/{periodId}  (new; periodId = the period's start date, UTC, "YYYY-MM-DD")
type EmailUsage = { total: number; consecutiveFailures: number; lastError?: string; updatedAt: Timestamp };

// users/{uid}  (new optional fields; admin-written by the existing admin update clause)
credentialsEmailedAt?: Timestamp;  // last first-login or forgot-password email; presence means "emailed before"
credentialsEmailCount?: number;    // lifetime count, cap 12 (first-login and forgot-password emails both count)
emailInvalid?: boolean;            // an admin marked the address as unusable
passwordIsRoleDefault?: boolean;   // true = the account's password is the standard one for its role (§5.1); missing = unknown
defaultPasswordConfirmedBy?: string;      // uid of the admin who confirmed it by hand (only when confirmed that way)
defaultPasswordConfirmedAt?: Timestamp;   // when
dateOfBirth: string;               // existing field ("YYYY-MM-DD"); REQUIRED for every student from now on (§5.4); optional on the type for legacy documents

// password_requests/{institutionId}__{normalizedEmail}   (new, top-level; one document per person)
type PasswordRequest = {
  institutionId: string;
  email: string;                  // lower-cased, trimmed; what the person typed
  note?: string;                  // optional message to the administrator, plain text, at most 200 characters
  status: 'requested' | 'approved' | 'rejected' | 'cancelled' | 'skipped' | 'expired'
        | 'reset_done' | 'reset_failed' | 'sent' | 'send_failed';
  requestedAt: Timestamp;         // request.time
  targetUid?: string;             // set by the approving admin's lookup (never by the public)
  targetName?: string; targetRole?: Role;
  approvedBy?: string; approvedAt?: Timestamp;
  verifiedBy?: string; verifiedAt?: Timestamp;   // written with the approval (§6.2): the admin's tick "I have checked that this is the account holder"
  verifiedMethod?: 'phone' | 'in_person' | 'other';
  resetAt?: Timestamp; sentAt?: Timestamp;
  reason?: string;                // short text: why rejected, skipped or failed
};

// platform_config/password_script  (new; written only by the script; readable by every admin, §9)
type PasswordScriptStatus = { lastRunAt: Timestamp; lastRunMode: 'batch' | 'watch'; processed: number; failed: number };
```

`resolveEmailSettings(institutionId)` is a pure function (settings document + usage document + `now`) that returns the EmailJS ids and `reply_to`, or one block reason: `disabled`, `not-configured`, `no-reply-to`, `monthly-limit`, `paused-after-failures`. It is the **only** place that knows where the sender comes from; a later platform-wide sender replaces it (see the other spec's `resolveSender()`). The usage counter is written with Firestore `increment(1)` and `increment(-1)` so two admins sending at once cannot overwrite each other, which is also what the rules' +1/−1 check expects (§9).

**Period id.** The start date (UTC) of the current EmailJS billing period: the most recent `periodStartDay` on or before today, clamped to the month's last day. A wrong client clock misplaces counts but never bypasses EmailJS's own cap. The period boundary is computed in **UTC**, while EmailJS bills in its own timezone, so the counter can be one day out around the billing date; the 80% warning leaves room for that.

**Role-default marker.** `passwordIsRoleDefault` answers "is this account's password the standard one for its role?", which `mustChangePassword` cannot. It is written:

- `true` when an account is created with a password equal to its role default (`AdminCreateUserForm`, Registrations "Convert to accounts", the bulk import, seed scripts) and `false` when the admin edited it;
- `true` by the reset script after it resets an account (§6.2 step 5);
- `true`, together with `defaultPasswordConfirmedBy` and `defaultPasswordConfirmedAt`, when an `institution_admin` **confirms it by hand** for an account whose marker is missing or `false` (a confirm dialog: "I confirm this account still uses the standard {role} password. I have not changed it and, as far as I know, neither has the person."). The confirmation is stored **once per account**; if it is wrong, the person sees the normal password box (§4.3 step 4) and the email says whom to contact.

A missing marker means **unknown** and is treated as not sendable until it is confirmed (§5.1). The marker only matters while `mustChangePassword` is `true`; once the person sets their own password the owner rule clears `mustChangePassword`, the account stops being eligible, and the marker is ignored (the owner cannot write it).

**Slug.** Lower-case letters, digits and single hyphens, 3 to 40 characters, not starting or ending with a hyphen; a short reserved list is refused (`login`, `register`, `password`, `dashboard`, `admin`, `api`; this is defensive only, since the slug is the second path segment of `/login/<slug>/<role>` and cannot collide with a route today). It is **suggested from the institution's name** (§3.1), **set once by `super_admin`, only while the institution has none**, and **never changes or is removed afterwards, by anyone including `super_admin`** (§9 enforces it), because every email already sent carries it; renaming an institution later does not change its slug. Existing institutions (GENR8-3D Academy) are given a slug by `scripts/backfill-institution-slugs.mjs` or by the one-time "Link name" field on Institution Profile; until then their link falls back to the normal login and the Send actions are disabled with the reason "This institution has no link name yet." Uniqueness comes from the **`institution_slugs/{slug}` reservation document**, created in the same batch as the institution; a create on an existing document is refused by the rules, so the whole batch fails and no duplicate is possible.

### 3.1 Suggesting and checking a slug

All of this logic lives in one pure module, `src/lib/institutionSlug.ts`, so the form, the Institution Profile field, the rules' format check and the backfill script agree.

**`suggestSlug(name)`** turns a name into a candidate, in this order:

1. Unicode-normalise (NFKD) and strip combining marks, so accents disappear (`École` becomes `Ecole`).
2. Lower-case.
3. Remove apostrophes and quotes (`Mary's` becomes `marys`, not `mary-s`).
4. Turn every other run of characters that are not a letter or digit into **one hyphen**.
5. Trim leading and trailing hyphens.
6. If longer than **36** characters, **cut at the last whole word** that fits (keep every word; no filler words are dropped). The limit is 36, not 40, to leave room for a clash suffix (`-2` to `-5`, at most 2 characters) and the `-school` addition (7) inside the 40-character maximum.
7. If the result is a reserved word (`login`, `register`, `password`, `dashboard`, `admin`, `api`), append `-school`; apply the cut in step 6 again afterwards if the result is still over the limit.
8. If the result is empty or shorter than 3 characters (a name in a non-Latin script, or symbols only), return an empty suggestion: the field stays blank and the `super_admin` must type one.

Examples: `GENR8-3D Academy` gives `genr8-3d-academy`; `St. Mary's High School` gives `st-marys-high-school`; `École Saint-Jean` gives `ecole-saint-jean`; `Admin` gives `admin-school`; `The Holy Trinity High School of Kingston and St Andrew` (54 characters as a slug) is cut at a whole word to `the-holy-trinity-high-school-of`.

**`validateSlug(slug)`** applies the format in §3 (the same pattern the rules use) and returns a short reason, used by the form, the Institution Profile field and the script.

**`findFreeSlug(candidate)`** makes **one query**, `getDocs(query(collection(db, 'institution_slugs'), where(documentId(), 'in', [s, s-2, s-3, s-4, s-5])))`, and returns the first candidate that is not in the result. **Every candidate is first checked with `validateSlug`**; one that fails (for example a 40-character base plus a suffix) is skipped, and if all five fail the form asks the `super_admin` to shorten the name. It costs one read per slug that already exists (a free slug costs nothing beyond the query), works from a signed-in form because `institution_slugs` is publicly readable, and is the only place that knows the numbering.

**On `InstitutionForm`** (react-hook-form and zod are already used there):

- A **Link name** field sits under the Institution name. It is **required**: the zod schema rejects a blank value ("Type a link name."), so no new institution is ever created without a slug and the backfill is only for institutions that already exist. It shows the preview `…/login/<slug>/student` and a note: "This is permanent. It is used in sign-in links already emailed to people, so it cannot be changed later."
- While the field has **not been typed in**, it follows the name: a `useEffect` watches `name` and calls `setValue('slug', suggestSlug(name))`. Once the `super_admin` types in it, it **stops following** (a `slugTouched` flag), and shortening it by hand is allowed (for example `genr83d` instead of `genr8-3d-academy`).
- After a short pause in typing (about 400 ms) the form calls `findFreeSlug`. If the candidate is free it shows "Available". If it was **suggested** (not typed) and is taken, the field moves to the first free number (`slug-2`) and says so. If the `super_admin` **typed** it and it is taken, nothing is changed silently: the form shows "Taken. Try `slug-2`" with a one-click button. **Only this single suggestion and the one button are built for now**; showing the numbered alternatives as chips is deferred (§16).
- **Save** runs `findFreeSlug` once more, then adds to the existing batch: `batch.set(doc(db, 'institution_slugs', slug), { institutionId: ref.id, createdAt: serverTimestamp() })`, and puts `slug` on the institution document and the `registration_directory` entry (merge write, as today). If another institution took the slug in between, the reservation `create` becomes an update and is refused, the **whole batch fails** (nothing partial is written) and the form shows "That link name was just taken, please choose another."

**On Institution Profile, for an institution with no slug:** a `super_admin` sees the same field with the same suggestion and checks, saved in one batch (reservation, institution and directory entry), after which it is **read-only** with "Cannot be changed". An `institution_admin` sees the Link name **read-only** with the **full sign-in links** it produces (`<VITE_APP_URL>/login/<slug>/student`, `…/parent` and `…/teacher`, and the plain `<VITE_APP_URL>/login/<slug>` that only preselects the institution) and a **Copy** button for each, so the page address can be shared by hand. Each button copies **only the bare URL** (no instruction text); its label switches to "Copied" for about two seconds and an `aria-live="polite"` region announces it (no toast). The value comes from the institution document `AuthContext` already loads (`slug` is added to `InstitutionBrand`), so it costs no extra read.

**`scripts/backfill-institution-slugs.mjs`** fills every institution that has none: same algorithm (a small copy in the `.mjs`, with a unit test that runs both implementations over a fixture list so they cannot drift), clashes resolved by the same numbering, a table printed first (**dry run by default**), and with `--live` the reservation, institution and directory entry are written together per institution; running it again changes nothing.

---

## 4. The login link (option A, path-only)

### 4.1 Why A, and why not B

**Chosen (A):** `/login/<slug>/<role>` opens the form with the institution selected and the password already known to the page; the person types only their email.

**Rejected (B), automatic sign-in on click:** the link would have to sign the person in on page load.

- It needs the credential to travel in the link (or the role code to be turned into a sign-in with no user action), and a **link that signs in on load is activated by anything that opens it**: a mail scanner or link previewer that runs JavaScript signs the account in (and takes the one-active-session lock) before the person clicks.
- Anyone holding the email, or a forwarded copy, gets in with **no typed secret**; with A the person must also type the address the email arrived at.
- `signInWithEmailAndPassword` needs the email too; B would put the address in the URL (server logs, history, `Referer`).
- A failed sign-in on load (password already changed) needs its own fallback UI anyway, the same as A's.

B can be added later without changing the template: the link stays the same and the page decides what to do with it.

### 4.2 Link format

`<VITE_APP_URL>/login/<slug>/<roleCode>`, for example `https://app.example.com/login/genr83d-academy/student`.

- **Both values are path segments.** No query string and no `#` fragment, so no mail program, link wrapper or tracker can drop them, and nothing depends on browser fragment handling.
- Allowed role codes: `student`, `parent`, `teacher` (`regular_teacher` and `senior_teacher` share one default). A student under the guardian threshold gets the **student** code (the link opens the student's sign-in).
- Consequence of using a path: both segments reach the server (Vercel request logs). Neither is secret: the slug is public (it is in `registration_directory`) and the role code only names a role.
- The slug must match an entry in `registration_directory`; an unknown slug or role code is **ignored** and the normal login appears (the post-login institution gate still applies either way, so a wrong slug can never sign someone into the wrong institution).
- No email address, no name and no password in the URL. The e2e login helper starts at `/login` and is unaffected.
- **A link without a role** (`/login/<slug>`, for example a truncated link or one shared by hand) opens the normal login form with the institution preselected and a **visible** password box; it never hides the password.

### 4.3 Behaviour on `/login/:slug/:role`

1. `App.tsx` adds `<Route path="/login/:slug/:role" element={<PostLoginInstitutionGate />} />` and `<Route path="/login/:slug" element={<PostLoginInstitutionGate />} />` beside `/login`. `LoginPage` reads the route params with `useParams`. With a slug that matches the already-loaded directory it **skips the "choice" view**; `LoginFormView` preselects that institution once `fetchAllInstitutions()` resolves (no extra read). The page keeps working through "← Back" because the params are part of the route. **While `fetchAllInstitutions()` is still loading** the page shows the existing blank card with a spinner (not the "choice" view), so it never flashes the wrong screen; if the directory fails to load it falls back to the normal login with the institution dropdown.
2. With a valid role code the form is in **"first-login mode"**: the Institution and Email fields show, the **password box is not rendered**, and the page holds the role's default password in state (from `src/lib/roleDefaultPasswords.ts`, imported by `AdminCreateUserForm.tsx`, the import page and the login scene; `scripts/*.mjs` keep their own copy, noted in the sync comment). A short line explains: "Enter the sign-in email address from your message." The heading says "Welcome" rather than "Welcome back".
3. Submit: validate the email, `setPendingLoginInstitution(resolvedInstitutionId)`, `signIn(email, defaultPassword)`. Success follows the existing path: `PostLoginInstitutionGate` checks the institution, then `Protected` shows **Set a new password**.
4. **Failure falls back to the normal form** (`auth/invalid-credential`, `auth/wrong-password`): the password box **appears, empty**, with the message "That didn't work. If you've already set your own password, type it below." The first failed prefilled attempt does **not** count toward the existing three-failure hint. A small **"I already have my own password"** link in first-login mode shows the box at any time. Other errors (`auth/user-disabled`, `auth/network-request-failed`, `auth/too-many-requests`, inactive account notice) keep their existing messages.
5. The fallback is not optional: **a person who already changed their password must never be stuck behind a hidden box.** It is also what implements "show the normal login page if the password has already been changed", with no Firestore read (a signed-out page cannot read `users`).
6. **Forgot password?** is a link under the form in every mode (§6.2). It goes to `/password/forgot/<slug>` when an institution is selected, otherwise to `/password/forgot`. The inert label beside the Password box is removed. When the institution's directory entry does **not** have `forgotPasswordOpen === true` (§8.1: the form is closed until the email setup is tested) the link is **hidden** (the directory is already loaded, so this needs no extra read), and `/password/forgot/<slug>` shows "Password requests are closed for this institution. Please contact your administrator." instead of the form (the same message whether the form was never opened or was closed later).
7. A link is **not a one-time token.** The role default stays valid until the person's first change; after that it stops working, and it works again if an administrator later resets the account to the default. An old email is therefore a live sign-in hint whenever the account is reset (it carries no secret, but it names the institution and role).

### 4.4 What the hidden password means for browsers and password managers

The password is held in component state and never put into the DOM, so the browser's password manager does not offer to save the role default. After the first password change the manager can save the new password at the "Set a new password" screen as it does today.

---

## 5. First-login email

### 5.1 When it can be sent

An account can be sent a first-login email only while it is **known to be at the role default**: `mustChangePassword === true` **and** `passwordIsRoleDefault === true` (§3). The table shows the `mustChangePassword` side; the marker rule follows it.

| State                                         | First-login email                                                                            |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `mustChangePassword === true`, never emailed  | **Selectable**                                                                               |
| `mustChangePassword === true`, emailed before | **Selectable as "Resend"** (same email, same eligibility checks)                             |
| `mustChangePassword === false`                | Not selectable: the person has already set their own password. Use **Forgot password** (§6). |
| `mustChangePassword` missing (older accounts) | Not selectable: "This account has no first-sign-in record. Share the password by hand."      |
| Role `institution_admin` / `super_admin`      | Never offered (no default password)                                                          |

**The marker rule.** Whatever `mustChangePassword` says, the first-login email is offered only when `passwordIsRoleDefault === true`:

| `passwordIsRoleDefault`                       | Send / Resend                                                                                             | Offered instead                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `true`                                        | Selectable (subject to the other reasons)                                                                 |                                                                        |
| `false` (the password was edited at creation) | Not selectable: "This account was created with a custom password, so the sign-in link cannot sign it in." | **Forgot password** (§6: an approved reset sets the standard password) |
| missing (unknown)                             | Not selectable: "This account's password is not known to be the standard one."                            | **Confirm standard password** (the dialog in §3), then Send            |

**Modes.** One pure function, `loginEmailEligibility(account, guardians, settingsResult, now, limits, mode)`, serves three situations. It returns "ok" or the **first** reason that applies, in this order; the table shows which reasons each mode checks:

| #   | Reason                                                                                                                                                                                                            | `first-login` (Send / Resend from a list or at creation) | `forgot-approve` (admin reviewing a request, before any reset)           | `forgot-send` (after the script has reset the account) |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| 1   | Role has no default password (admin roles), or the account is not active                                                                                                                                          | checked                                                  | checked                                                                  | checked                                                |
| 2   | `mustChangePassword` is not `true` ("This person has already set their own password." / "This account has no first-sign-in record.")                                                                              | checked                                                  | **skipped** (a person who forgot their password normally has it `false`) | checked (the script has set it `true`)                 |
| 3   | `passwordIsRoleDefault` is not `true` (the marker rule above)                                                                                                                                                     | checked                                                  | **skipped** (the reset will set it)                                      | checked (the script has set it `true`)                 |
| 4   | The institution has no `slug` ("This institution has no link name yet.")                                                                                                                                          | checked                                                  | checked                                                                  | checked                                                |
| 5   | A student has **no date of birth** ("This student has no date of birth. Add it to the student's profile.")                                                                                                        | checked                                                  | checked                                                                  | checked                                                |
| 6   | A student under `guardianAgeThreshold` (age from `dateOfBirth` on the day of sending) has no linked guardian with a usable address ("This student is under {threshold} and has no guardian with an email address linked.") | checked **on click**, not when the list opens (§5.2)     | checked on the approval screen's row                                     | checked                                                |
| 7   | The recipient's address is empty or marked `emailInvalid`                                                                                                                                                         | checked                                                  | checked                                                                  | checked                                                |
| 8   | The 12-email lifetime cap is reached                                                                                                                                                                              | checked                                                  | checked                                                                  | checked                                                |
| 9   | The 24-hour cooldown has not passed | checked | **checked at approval**, and again by the script before it resets, so no reset is made that cannot be emailed | **skipped** (the reset has already happened; the cooldown was checked before it) |
| 10  | `resolveEmailSettings()` blocks (disabled, not configured, no Reply-To, monthly limit, paused) | checked | **checked at approval**: enabled, configured, no pause, and monthly allowance left for the approved backlog plus this request | checked |

A button that is not selectable is **shown disabled with its reason**, except reason 6 on the Students list, which is shown when the admin clicks (§5.2).

### 5.2 Where it is offered

- **At account creation** (`AdminCreateUserForm`, also Registrations "Convert to accounts"): a tick-box **Email the sign-in link to this person**, offered only when the typed password **still equals the role default** (an edited password cannot be sent: the link has no secret, so the person would be locked out). The account is created with `passwordIsRoleDefault: true` when the password equals the default and `false` when the admin edited it. It sends after the account exists; a failure never undoes creation.
- **After creation:** a per-row **Send sign-in email** action (and **Resend**) on the Students, Teachers and Parents lists, for `institution_admin`, using the eligibility above (`first-login` mode) and a **fresh read** of the account (not the cached list). The list rows carry `mustChangePassword`, `passwordIsRoleDefault`, `credentialsEmailedAt`, `credentialsEmailCount`, `emailInvalid` and (Students) `dateOfBirth`, so reasons 1 to 5 and 7 to 9 show on the disabled button with no extra read. A row whose marker is missing shows **Confirm standard password** in place of Send; confirming opens the dialog in §3.
- **Bulk import:** a commit-step section **Email the sign-in link to N students**; it shows the remaining monthly allowance, stops at the cap, runs after every row is created, and sends one email per second (EmailJS's rate limit) with one retry on a 429 or network error, then stops and reports.
- **Which template.** A recipient who is the account holder (student at or over the threshold, parent, teacher) is emailed with `is_guardian` empty (**Self**). A student under the threshold is emailed with `is_guardian` set (**Guardian**), sent to a **linked guardian** (the first linked parent with a usable address, or the one the admin picks): it greets the guardian, names the student, says the message is for the guardian because they are listed as the student's parent or guardian, and gives **the student's sign-in email address** (the guardian's own address is not the student's account). The link opens the student's sign-in (`/login/<slug>/student`). The stamped account (`credentialsEmailedAt`, count) is always the student's.
- **Guardian lookup, evaluated on click.** For a student **under `guardianAgeThreshold`** the Students list shows **Send** enabled (the guardian is not looked up for every row, which would be a read per row). Pressing it runs one fresh lookup: `getDocs(query(collection(db, 'student_parents'), where('studentId', '==', id)))` (admins read it, scoped to the institution), then a `getDoc` of each linked parent's `users` document (admins read these) for the address. It picks the first parent whose address is present, valid and not `emailInvalid`; when **more than one** qualifies, a **guardian picker dialog** lets the admin choose. When none qualifies, a dialog shows the reason in reason 6's words instead of sending. Cost: one query plus one small read per linked parent, only when the admin presses Send for a young student. On the `forgot-approve` screen the same lookup runs for each young student's row when the page opens.
- **The guardian's own account is separate.** A guardian is also a `parent` account that may itself still be at the default and never emailed; the Guardian email covers only the **student's** sign-in. The parent's own sign-in email is sent from the Parents list like any other (§5.1).

### 5.3 Sequence

1. Eligibility check on a fresh read of the account.
2. `resolveEmailSettings()` and the monthly counter (reserve +1 before the request; −1 on a clear failure; keep it on an ambiguous one).
3. Build the payload (§7) and `sendEmail()` with the one template's id, and `is_guardian` set for a guardian.
4. On a confirmed send: stamp the account (`credentialsEmailedAt` now, `credentialsEmailCount` + 1). On failure: stamp nothing and show a short message; the admin shares the password by hand, as today.

### 5.4 Date of birth is required for every student

The guardian rule needs a reliable age, so a student **without a date of birth is blocked** from these emails (reason 5, §5.1: it is never treated as "under the threshold" or "over it"). From now on the field is **required** everywhere a student is created or edited:

| Place                                                     | Today                                                                                             | Change                                                                                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create User form (`AdminCreateUserForm`)                  | Required for students; the student must be at least 3 years old                                   | Unchanged; add the upper bound below                                                                                                                                                                      |
| Registrations "Convert to accounts"                       | Takes the registration's `dateOfBirth`, which the registration form and its rules already require | Unchanged                                                                                                                                                                                                 |
| Bulk import (`importStudents.ts`, `Date of Birth` column) | `required: false`                                                                                 | `required: true`; update the downloadable template, its example row and the on-screen instructions; a row without a valid date is rejected like any other invalid row                                     |
| Student edit form (`StudentForm`)                         | Optional; a blank value is saved as `null`                                                        | Required, validated like the Create form, and **cannot be cleared**; saving a student who has none requires entering one                                                                                  |
| Firestore rules (`users`)                                 | Not checked                                                                                       | A `student` user can only be **created** with `dateOfBirth` matching `^\d{4}-\d{2}-\d{2}$` (a string of 10 characters), and an existing `dateOfBirth` cannot be removed or set to null or empty on update |
| Seed scripts and e2e accounts                             | Some create students without one                                                                  | The Admin SDK bypasses rules, so every seed script and QA fixture must be updated by hand to give each student a date of birth                                                                            |

**Plausibility.** The date must be a real calendar date, **not in the future**, giving an age of **at least 3** (the existing rule) and **at most 100** years (adult learners exist in custom-mode institutions, so the upper bound is generous). The same validator is used by the forms, the import and the eligibility function; the rules only check the format and the presence.

**Legacy students** with no date of birth are left as they are (nothing is invented). They are:

- **blocked** from first-login and Forgot Password emails with the reason in §5.1;
- shown on the Students list with a **"Missing date of birth" badge** and a **filter** for it, computed from the list data already loaded (no extra reads);
- fixed by opening the student and entering the date, or by re-importing with the column filled in.

A one-time fix-up screen with an inline date field per row is deferred (§16).

### 5.5 The sign-in address must be the Auth address

The email a person signs in with is their **Firebase Auth** address, but the Student and Parent edit forms let an admin change or blank `users.email`, which changes the Firestore document only. A changed address would make `account_email` in the Guardian email wrong and would make the Forgot Password lookup (which searches `users.email`) miss the person. The fix is to remove the cause and to find any existing damage:

- **`email` is read-only on the Student and Parent edit forms** (`StudentForm`, `ParentForm`): the field is shown with the note "This is the sign-in address and cannot be changed here." It also **can no longer be saved blank** (today both forms accept an empty value and write `email: null`, which is the real way a document address drifts from the Auth address). **`TeacherForm` has no email field**, so nothing changes there. The Create User form is unchanged. `src/lib/profileEditDiff.ts` drops `email` from `STUDENT_EDIT_FIELDS` and `PARENT_EDIT_FIELDS` (an edit can no longer change it, so it no longer belongs in the audit detail) and `src/lib/__tests__/profileEditDiff.test.ts`, which compares those lists with each form's row shape, is updated.
- **`scripts/audit-account-emails.mjs`** (owner-run, Admin SDK): a **report** of every account whose Firestore `email` differs (after lower-casing and trimming) from its Firebase Auth email, and, with `--fix`, a **correction** of the document (below).
- `account_email` in the emails and the Forgot Password lookup use `users.email` **lower-cased**; the read-only fields and the audit are what make that safe. (The create form already stores `email` lower-cased.)

#### The audit and fix script

**Which side is correct.** The **Firebase Auth address is the source of truth**: it is what the person signs in with. `--fix` therefore rewrites **only** `users/{uid}.email` in Firestore, set to the lower-cased Auth email. It **never changes Firebase Auth**, so no one's sign-in address changes and no one can be locked out or signed out by it.

**Flags.** Without `--fix` the script is a read-only report. `--fix` plans the corrections; **nothing is written unless `--live` is also given** (a dry run is the default, like the reset and backfill scripts). `--institution=<id>` limits a run to one institution; `--key=<path>` points at the service-account key.

**What it does.** It reads the Auth users with the Admin SDK's `getUsers` in batches of 100 and the `users` documents (per institution when scoped), and classifies every account:

| Class                      | Meaning                                                 | Action                                                      |
| -------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| match                      | The addresses are equal after lower-casing and trimming | none                                                        |
| differs (fixable)          | Both exist and differ                                   | corrected by `--fix --live`                                 |
| no Auth user               | A `users` document whose uid has no Auth record         | **report only**                                             |
| Auth user without an email | The Auth record has no email                            | **report only**                                             |
| document without an email  | The `users` document has none                           | **report only** (correcting it is a decision for the owner) |

It first prints the table of intended changes (uid, role, institution, both values), then, only with `--live`, writes `email` on each fixable document and nothing else. It is **idempotent**: a second run finds nothing to fix. Reads cost one per user document and are a one-off.

**Backup log.** Every run (dry or live) appends to `scripts/logs/audit-account-emails-<timestamp>.json` (gitignored): uid, institution, role, old value, new value, time and mode (`dry-run` or `live`). It holds email addresses, so it stays on the owner's machine; it is what lets a fix be reversed by hand.

**Audit entry per fix.** Each corrected account also gets an entry in that institution's audit log with a new event type, **`account_email_corrected`**, performed by a fixed script identity (shown as "Owner script (audit-account-emails)"), with `targetUid` and `targetName` and a `detail` that **contains no address** ("Document email corrected to match the sign-in address"), because the audit log is permanent and addresses are personal data. The type is mirrored in `AuditEventType` (`src/lib/firebase.ts`), `firestore.rules`, `src/lib/__tests__/auditRules.test.ts` and `src/lib/auditEvents.ts` so the drift test and the audit screens stay consistent, even though the Admin SDK itself bypasses the rules.

**When to run it.** Once before launch, and whenever an account's address is questioned: first as a report, then `--fix` as a dry run, read the table, then `--fix --live` (use `--institution=<id>` for the first live run).

### 5.6 People and cases this feature does not cover

- **`institution_admin` and `super_admin` accounts** have no default password, so they get no first-login email and cannot use Forgot Password (a request for one can only be rejected or skipped). The **first `institution_admin`'s credentials are still handed over by the `super_admin` by hand**, and a forgotten admin password is recovered by the `super_admin` (Firebase console or a one-off reset), not by this flow.
- **A guardian's own sign-in** (their `parent` account) is a separate email from the Parents list (§5.2).
- **People with no usable email address** (many students) are never emailed; the admin shares the password by hand, as today.
- **Accounts whose password is not the standard one** and have not been confirmed (§5.1) must be confirmed first, or reset through Forgot Password.

---

## 6. Forgot Password

### 6.1 Why it needs an administrator and a script

- A browser can only change **its own** signed-in user's password; resetting someone else's needs the **Admin SDK** (no Cloud Functions on Spark).
- A self-service reset to the **public** role default would let anyone who knows an email address lock that person out and then sign in as them. The administrator's approval is the identity check.
- A signed-out visitor cannot read the EmailJS ids, so the email is sent by the **`institution_admin`'s** browser after the reset, never by the requester.

### 6.2 The flow

1. **Entry.** **Forgot password?** (a link under the login form, in every mode) opens `/password/forgot/<slug>`; with no institution chosen it opens `/password/forgot`, which shows an Institution selector (from the already-cached directory). Nothing is submitted from the login form. The link and the page are available only while the institution's directory entry has `forgotPasswordOpen === true`; the form is **closed until the email setup is tested** (§8.1), and a closed form shows the closed message (§4.3).
2. **Form.** The page asks for the **email address** and an optional **Message to your administrator** (up to 200 characters, for example a class or a phone number to help them check it is you). **Submit** validates the email and opens the confirmation modal; it does not write anything.
3. **Confirmation modal** (warning style: amber border and icon, `role="alertdialog"`, focus moves into it and is trapped, **Escape and Cancel close it**, clicking outside does not). Draft text:

   > **Before you continue**
   > If your administrator approves this request, your **current password will be reset** to a temporary one and you will be **signed out**. You will then receive an **email with a link** to sign in and choose a new password.
   > Until you receive that email, keep using your current password. If you remember it, just sign in instead.
   > ☐ I understand
   > [Cancel] [Continue]

   **Continue** is disabled until the tick-box is ticked. Only Continue writes `password_requests/{institutionId}__{email}` (with `note`) and then shows the **same neutral message** whatever the account state: "Request sent. If that address belongs to an account at this institution, your administrator will review it and contact you. No result reveals whether the account exists, or whether a request was already waiting." A repeat submission inside the cooldown (§9) shows the same message.

4. **Approval.** The institution's `institution_admin` opens **Password requests** (ADMINISTRATION group; one `getDocs` when the page opens, filtered by `institutionId`) and sees, above the list, the **Forgot password Open/Closed bar** with the request counts and the Close / Reopen button (§8.1), and then the requests with the person's **note**. For each, the app looks up the account by email within the institution (one query) and shows name, role, class or department, and whether the account is eligible (`forgot-approve` mode, §5.1: it checks that the account exists, is active, has a role with a default password, is not blocked by the address, date-of-birth, guardian or lifetime-cap reasons, and **skips** only the `mustChangePassword` and marker reasons, because the reset will set them). It **does** check the cooldown, the lifetime cap and the sender (`resolveEmailSettings`: enabled, configured, no pause, and monthly allowance left for the approved backlog plus this request), so a reset is never approved that cannot then be emailed. The admin **approves** or **rejects**, singly or in bulk. **Approving needs a verification tick:** a dialog asks the admin to confirm "I have checked that this is the account holder" and to choose how (phone, in person, other); the app records `verifiedBy`, `verifiedAt` and `verifiedMethod` on the request (no personal details), and the script refuses an `approved` request that lacks them. Rejecting needs a short reason. A bulk approval uses one dialog for all the selected rows. A request with no matching account, or a role with no default password, can only be rejected or marked skipped with a reason that stays on the admin's side. The screen says the reset **overrides the person's current password**.
5. **Reset.** The `super_admin` runs `scripts/process-password-requests.mjs --live` (or leaves it running with `--watch`). For each `approved` request it **re-validates everything itself** (it bypasses security rules): the approver is an `institution_admin` of the request's institution; the target exists in that institution, is active and has a role with a default password; the lifetime cap is not reached and the 24-hour cooldown has passed (so the send that follows cannot be blocked by it); the request has **not expired** (§6.4) and carries the approval's `verifiedBy`; and the person has **not signed in since the request** (the Auth record's `lastSignInTime` is earlier than the request's `requestedAt`; otherwise the request becomes `skipped` with "signed in since the request", so a person who remembered their password is not locked out); then it resets the Auth password to the role default, **revokes the refresh tokens**, sets `mustChangePassword: true` and `passwordIsRoleDefault: true`, writes a `password_reset` audit entry, sets the request to `reset_done` (or `reset_failed` / `skipped` with a reason) and updates the heartbeat. A dry run is the default.
6. **Email.** The `institution_admin`'s page shows `reset_done` requests with **Send email** (and **Send all ready**). Sending re-checks eligibility and the limits (`forgot-send` mode, §5.1), builds the email (the one template, with `is_guardian` set for a young student's guardian), sends, and stamps the account. Statuses become `sent`, or `send_failed` with a **Retry send** button (no second reset is needed, the account is already at the default).
7. **After.** The person follows the link, signs in with their email, and sets a new password, exactly as for a first login.

| Status                  | Set by                      | Meaning                                             |
| ----------------------- | --------------------------- | --------------------------------------------------- |
| `requested`             | the person (public create)  | Waiting for the institution admin                   |
| `approved` / `rejected` | institution admin           | Waiting for the script / closed                     |
| `cancelled`             | institution admin           | Withdrawn                                           |
| `reset_done`            | script                      | Password is the role default; waiting for the email |
| `reset_failed`          | script                      | The reset did not happen (reason shown)             |
| `sent`                  | institution admin's browser | Email confirmed sent                                |
| `send_failed`           | institution admin's browser | Reset done, email failed; retry or share by hand    |
| `skipped`               | any step                    | No longer eligible when re-checked                  |
| `expired` | the cleanup script (and shown as expired by the page) | Left `requested` or `approved` for more than 14 days; the person may ask again (§6.4) |

### 6.3 Consequences

- **The reset overrides the person's current password** and signs them out of any active session (revoked tokens). The modal and the approval screen say so.
- **The modal's wording is conditional on approval** ("if your administrator approves"), because an administrator can reject a request; it must never say the password "will be reset" unconditionally.
- **Exposure window.** From the reset until the person's first sign-in the password is the role default, which is public knowledge; anyone who knows the person's email address and institution could sign in. Approve, reset and send back to back and avoid leaving `reset_done` requests unsent.
- **Dependence on the owner's machine.** Nothing is reset until the `super_admin` runs the script; the page shows how many requests are waiting and **when the script last ran**.
- If the email fails after the reset, the person's old password no longer works; the admin retries the send or hands the password over by hand.
- A person with **no usable email address** cannot use this flow; the administrator resets by hand.

### 6.4 Expiry, retention and the collection notice

- **Expiry.** A request still `requested` or `approved` **14 days** after `requestedAt` is treated as expired: the Password requests page shows it as expired at once, and `scripts/cleanup-password-requests.mjs` sets its status to `expired`. The rules let the same person submit a **new** request when the stored one is more than 14 days old, whatever its status (§9), so a request nobody actioned never blocks them for ever. A request already `reset_done` is **not** expired by the script: its account is at the default and must be emailed or handled by hand.
- **Retention.** `scripts/cleanup-password-requests.mjs` (owner-run, Admin SDK, dry run by default, `--live` to write, `--institution=<id>`) also **deletes closed requests older than 90 days** (`sent`, `rejected`, `cancelled`, `skipped`, `expired`, `reset_failed`, `send_failed`) so email addresses and notes are not kept for ever; it lists what it would do first and appends a log under `scripts/logs/` without personal data (counts and ids only). Audit entries are unaffected.
- **Collection notice on the form.** The Forgot Password page shows a short notice: "We use your email address and your message only so your administrator can check and act on your request. They are deleted after 90 days." with a link to the Privacy Notice.
- **The person cannot see their request's status** (they are signed out); the neutral message says the administrator will be in touch. A status check is deferred (§16).

---

## 7. Email templates

**One** EmailJS template in the institution's account (the "Login email"; the free plan allows two, so one slot stays spare), serving both audiences, **Self** (the account holder) and **Guardian**, through conditional sections (§7.4). It is based on the table-and-inline-style structure of `internal/regarding-emailjs/templates_used_by_other_repos/regarding_change.md` (reference only; nothing is shared with that repo). Tables and inline styles only (Gmail, Outlook and Apple Mail ignore `<style>` blocks and flexbox).

**One template for everything.** It is used for the first-login and the forgot-password email, for the account holder and for a guardian. The wording that differs between first login and forgot password is **passed as variables** by the payload builder (the wording lives in one file in `src/lib/loginEmail/`), and the parts that differ for a guardian are **conditional sections** switched by `is_guardian` (§7.4). If separate fixed-wording templates are wanted later (first login and forgot password, each Self and Guardian), they fit in the free plan's **one spare slot** only partly (two templates in total); more need a paid plan (Personal: 6 templates). The earlier decision to keep two templates, Self and Guardian, was replaced after EmailJS's conditional syntax was found.

### 7.1 EmailJS settings (not part of the HTML)

| Setting          | Value                                                               |
| ---------------- | ------------------------------------------------------------------- |
| Service          | The institution's connected Gmail (Workspace) service; the From address is the service's |
| To Email         | `{{to_email}}`                                                      |
| From Name        | `{{institution_name}}`                                              |
| Reply To         | `{{reply_to}}`                                                      |
| Subject          | `{{subject}}`                                                       |
| Activity logging | **Off** if the template settings offer it (so request history keeps no personal data); verify on the dashboard |

### 7.2 Template variables

Every value is a **plain template variable**; the builder passes plain text and EmailJS HTML-escapes `{{double braces}}` (verify on the dashboard; if it does not, the builder escapes `& < > " '` itself). Variables are case-sensitive and must match the builder; a unit test checks the list. EmailJS reserves `user_os`, `user_ip`, `user_platform`, `user_browser`, `user_version`, `user_country` and `user_referrer`; none of ours clash with them.

| Variable                                                              | Self                                            | Guardian                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| `to_email`, `to_name`                                                 | the account holder                              | the guardian                                                    |
| `institution_name`, `portal_name`, `reply_to`, `website_url`          | same                                            | same                                                            |
| `logo_url`                                                            | `<VITE_APP_URL>/apple-touch-icon.png`           | same                                                            |
| `login_url`                                                           | `<VITE_APP_URL>/login/<slug>/<role>`            | `<VITE_APP_URL>/login/<slug>/student`                           |
| `account_email`                                                       | the account holder's own address (= `to_email`) | **the student's** sign-in email address                         |
| `student_name`                                                        | not used                                        | the student's name                                              |
| `is_guardian` | empty or omitted | a non-empty value (for example `yes`); switches the guardian sections of the one template (§7.4) |
| `role_label`                                                          | "student", "parent", "teacher"                  | "student"                                                       |
| `subject`, `heading`, `intro_line`, `steps_heading`, `closing_notice` | first-login or forgot-password wording          | first-login or forgot-password wording, in the guardian's voice |

**Wording passed in the variables** (all built in code; `{I}` is the institution, `{P}` the portal, `{S}` the student):

| Variable         | First login, Self                                        | Forgot password, Self                                                                            | First login, Guardian                                                                                                  | Forgot password, Guardian                                                                                                                        |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `subject`        | Your {I} account is ready                                | Reset your {I} password                                                                          | A sign-in link for {S} at {I}                                                                                          | A password reset for {S} at {I}                                                                                                                  |
| `heading`        | Your account is ready                                    | Your password was reset                                                                          | Sign-in details for {S}                                                                                                | {S}'s password was reset                                                                                                                         |
| `intro_line`     | {I} has created an account for you on {P}.               | Your administrator at {I} has reset your password after your request.                            | {I} has created an account for {S} on {P}. This message is for you because you are listed as their parent or guardian. | {S}'s administrator at {I} has reset their password after a request. This message is for you because you are listed as their parent or guardian. |
| `steps_heading`  | How to sign in for the first time                        | How to sign in again                                                                             | How {S} signs in for the first time                                                                                    | How {S} signs in again                                                                                                                           |
| `closing_notice` | If you did not expect this email, reply to this message. | If you did not ask for this, reply to this message so your administrator can check your account. | If you did not expect this email, reply to this message.                                                               | If this was not requested, reply to this message so the administrator can check the account.                                                     |

`logo_url` is a constant, never read from `registration_directory`. **It is the app's own icon**, a public PNG served by the app itself (`public/apple-touch-icon.png`, 180 px, shown at 48 px so it stays sharp on high-density screens). `.ico` is not used (Gmail and Outlook cannot display it) and the 16 and 32 px files are too small. Gmail blocks `data:` images and the free plan has no `cid:` attachments, so a normal https URL is the right form. **Check before launch** that the PNG has a transparent background and reads well on the template's dark header (`#16181b`); if it does not, give the logo a white rounded tile or use a light header.

### 7.3 The template HTML (paste into the template's HTML source)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{heading}}</title>
    <!--
    EmailJS template "Login email": ONE template for the account holder (Self) and for a guardian (Guardian).
    Tables and inline styles only (Outlook ignores <style> and flexbox).
    Used for both the first-login and the forgot-password email: the wording comes in as variables, and the
    guardian parts are conditional sections ({{#is_guardian}}...{{/is_guardian}} shows only when is_guardian
    is set; {{^is_guardian}}...{{/is_guardian}} shows only when it is empty).
    Variables (case-sensitive, must match the payload builder in src/lib/loginEmail/):
      to_email, to_name, institution_name, portal_name, logo_url, website_url, login_url, reply_to,
      account_email, role_label, is_guardian, student_name, subject, heading, intro_line, steps_heading,
      closing_notice
    EmailJS settings: To Email {{to_email}}, From Name {{institution_name}}, Reply-To {{reply_to}},
    Subject {{subject}}. Activity logging off.
  --></head>
  <body style="margin:0;padding:0;background-color:#f5f5f5;">
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="background-color:#f5f5f5;"
    >
      <tr>
        <td align="center" style="padding:20px 14px;">
          <table
            role="presentation"
            width="600"
            cellpadding="0"
            cellspacing="0"
            border="0"
            style="width:100%;max-width:600px;background-color:#ffffff;border-radius:8px;"
          >
            <!-- Header with the app icon -->
            <tr>
              <td
                align="center"
                bgcolor="#16181b"
                style="background-color:#16181b;padding:16px 14px;border-radius:8px 8px 0 0;"
              >
                <a
                  href="{{website_url}}"
                  target="_blank"
                  style="text-decoration:none;"
                >
                  <img
                    src="{{logo_url}}"
                    alt="{{portal_name}}"
                    width="48"
                    height="48"
                    style="display:block;margin:0 auto;border:0;width:48px;height:48px;"
                  />
                </a>
                <div
                  style="margin-top:8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#e2e8f0;"
                >
                  {{institution_name}}
                </div>
              </td>
            </tr>

            <!-- Greeting -->
            <tr>
              <td
                style="padding:28px 30px 8px 30px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#333333;"
              >
                <h1
                  style="margin:0 0 20px 0;font-size:24px;line-height:30px;font-weight:bold;color:#16181b;"
                >
                  {{heading}}
                </h1>
                <p style="margin:0 0 16px 0;">Hello {{to_name}},</p>
                <p style="margin:0 0 20px 0;">{{intro_line}}</p>
              </td>
            </tr>

            <!-- Steps -->
            <tr>
              <td style="padding:0 30px 12px 30px;">
                <table
                  role="presentation"
                  width="100%"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  bgcolor="#f8fafc"
                  style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;"
                >
                  <tr>
                    <td
                      style="padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#333333;"
                    >
                      <div
                        style="font-size:12px;line-height:16px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#64748b;"
                      >
                        {{steps_heading}}
                      </div>
                      <ol style="margin:10px 0 0 0;padding-left:20px;">
                        <li style="margin:0 0 6px 0;">
                          Choose <strong>Open the sign-in page</strong> below{{#is_guardian}}, or pass the link to {{student_name}}{{/is_guardian}}.
                        </li>
                        <li style="margin:0 0 6px 0;">
                          Check that <strong>{{institution_name}}</strong> is
                          shown as your institution.
                        </li>
                        <li style="margin:0 0 6px 0;">
                          {{#is_guardian}}Type {{student_name}}'s sign-in email address:{{/is_guardian}}{{^is_guardian}}Type your sign-in email address:{{/is_guardian}}
                          <strong>{{account_email}}</strong>. {{#is_guardian}}A password is not needed: it is filled in for them.{{/is_guardian}}{{^is_guardian}}You do not need a
                          password: it is filled in for you.{{/is_guardian}}
                        </li>
                        <li style="margin:0;">
                          Press <strong>Sign In</strong>, then choose a new
                          password of {{#is_guardian}}their{{/is_guardian}}{{^is_guardian}}your{{/is_guardian}} own when asked.
                        </li>
                      </ol>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Button -->
            <tr>
              <td align="center" style="padding:12px 30px 8px 30px;">
                <table
                  role="presentation"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  align="center"
                >
                  <tr>
                    <td
                      align="center"
                      bgcolor="#ff6a00"
                      style="background-color:#ff6a00;border-radius:6px;"
                    >
                      <a
                        href="{{login_url}}"
                        target="_blank"
                        style="display:inline-block;padding:13px 30px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;"
                        >Open the sign-in page</a
                      >
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td
                align="center"
                style="padding:4px 30px 20px 30px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#64748b;"
              >
                If the button does not work, copy this link into your
                browser:<br />
                <a
                  href="{{login_url}}"
                  target="_blank"
                  style="color:#ff6a00;word-break:break-all;"
                  >{{login_url}}</a
                >
              </td>
            </tr>

            <!-- Notice -->
            <tr>
              <td style="padding:0 30px 20px 30px;">
                <table
                  role="presentation"
                  width="100%"
                  cellpadding="0"
                  cellspacing="0"
                  border="0"
                  bgcolor="#fffbeb"
                  style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:6px;"
                >
                  <tr>
                    <td
                      style="padding:14px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#92400e;"
                    >
                      <strong>If a password box is shown</strong> when the page
                      opens, {{#is_guardian}}{{student_name}} has already chosen a password of their own: they can type it in, or ask the administrator for help.{{/is_guardian}}{{^is_guardian}}you have already chosen your own password: type it
                      in, or ask your administrator for help.{{/is_guardian}}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Help -->
            <tr>
              <td
                style="padding:0 30px 28px 30px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;color:#333333;"
              >
                <h2
                  style="margin:0 0 10px 0;font-size:18px;line-height:24px;font-weight:bold;color:#333333;"
                >
                  Need help?
                </h2>
                <p style="margin:0 0 10px 0;">
                  {{closing_notice}} You can also write to
                  <a
                    href="mailto:{{reply_to}}"
                    style="color:#ff6a00;text-decoration:none;"
                    >{{reply_to}}</a
                  >.
                </p>
                <p style="margin:0;">
                  The link only opens the sign-in page for {{institution_name}}.
                  It does not contain {{#is_guardian}}a{{/is_guardian}}{{^is_guardian}}your{{/is_guardian}} password.
                </p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td
                align="center"
                bgcolor="#f8fafc"
                style="background-color:#f8fafc;padding:20px 30px;border-radius:0 0 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#64748b;"
              >
                <p style="margin:0 0 10px 0;">
                  <strong>{{institution_name}}</strong><br />{{portal_name}}
                </p>
                <p style="margin:0 0 10px 0;">
                  This email was sent to <strong>{{to_email}}</strong> because
                  {{#is_guardian}}you are listed as a parent or guardian of <strong>{{student_name}}</strong> at {{institution_name}}.{{/is_guardian}}{{^is_guardian}}{{institution_name}} manages an account for you
                  ({{role_label}}).{{/is_guardian}}
                </p>
                <p
                  style="margin:0;font-size:12px;line-height:18px;color:#999999;"
                >
                  Please do not forward this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

### 7.4 How the one template serves Self and Guardian

There is **one** EmailJS template (the "Login email"), not two. EmailJS templates support **conditional sections** (EmailJS's dynamic-variables guide: a `{{#variable}}...{{/variable}}` section is rendered only when the variable has a value, and `{{^variable}}...{{/variable}}` only when it does not), so the guardian wording is switched on by one variable, **`is_guardian`**, which the payload builder sets to a non-empty value for a guardian email and leaves empty (or omits) for an account holder:

| Place in the template | When `is_guardian` is empty (Self) | When `is_guardian` is set (Guardian) |
| --- | --- | --- |
| Greeting | `Hello {{to_name}},` (the account holder) | `Hello {{to_name}},` (the guardian; the intro line says which student) |
| Step 1 | "Choose **Open the sign-in page** below." | "Choose **Open the sign-in page** below, or pass the link to {{student_name}}." |
| Step 3 | "Type your sign-in email address: {{account_email}}. You do not need a password: it is filled in for you." | "Type {{student_name}}'s sign-in email address: {{account_email}}. A password is not needed: it is filled in for them." |
| Step 4 | "... choose a new password of your own when asked." | "... choose a new password of their own when asked." |
| Notice box | "If a password box is shown ... you have already chosen your own password: type it in, or ask your administrator for help." | "If a password box is shown ... {{student_name}} has already chosen a password of their own: they can type it in, or ask the administrator for help." |
| Help (last sentence) | "It does not contain your password." | "It does not contain a password." |
| Footer reason | "{{institution_name}} manages an account for you ({{role_label}})." | "you are listed as a parent or guardian of {{student_name}} at {{institution_name}}." |

The `login_url` for a guardian email always points at `/login/<slug>/student`. The wording that differs between **first login** and **forgot password** (`subject`, `heading`, `intro_line`, `steps_heading`, `closing_notice`) stays in the variables (§7.2).

**Consequences of one template.**

- The second free template stays **spare** (a future email type, or a fallback copy).
- The conditional sections make the one template more complex to test, so the payload builder is covered by a unit test that renders the template HTML with a small Mustache-style renderer for all four combinations (first login or forgot password, Self or Guardian) and checks that no `{{`, `{{#` or `{{^` remains and that each guardian-only phrase appears only when `is_guardian` is set (§13).
- **Verify on the dashboard** before building that EmailJS renders `{{^is_guardian}}` when the variable is empty or missing, and that a send with `is_guardian` omitted is accepted; if EmailJS treats an empty string differently, the builder omits the key.
- The earlier two-template design (Self and Guardian as separate templates) remains valid if the conditional rendering proves unreliable: the builder then passes the `guardianTemplateId` instead (§3 keeps an optional `guardianTemplateId`).

### 7.5 Wording rules

- **Plain-text part:** the template is HTML only and EmailJS may not send a plain-text alternative; check this on the dashboard (§11). Keep the HTML simple, one column, with the full link printed as text (it is), which is what spam filters like best without a text part.
- No exclamation marks, all-caps or "free/urgent" wording in the subject (spam-sensitive).
- The password is **never** printed; the email says the link does not contain it.
- Escape every value; build the link from the validated slug and an allow-listed role code; never put the recipient's address in the URL.
- Wording is kept in one file in `src/lib/loginEmail/` and reviewed before launch; templates live in the EmailJS dashboard, so a copy of the final HTML is kept with the other internal templates (`internal/regarding-emailjs/templates/`).

---

## 8. Limits, failures and abuse

| Control                  | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per account              | One email every **24 hours**; **12 per account for life** (first-login, resend and forgot-password emails all count; never reset)                                                                                                                                                                                                                                                                                                                                                     |
| Monthly (institution)    | `email_usage` counter against `monthlyLimit` (default 200, the institution's own EmailJS plan); warn at 80%, stop at the limit; reserve +1 before sending, −1 after a clear failure                                                                                                                                                                                                                                                                                                   |
| Rate                     | One request per second (EmailJS), one retry on 429 or a network error, then stop and report                                                                                                                                                                                                                                                                                                                                                                                           |
| Switch                   | `enabled` (institution_admin or super_admin); stops sending at one institution (the public Forgot password form has its own switch, `forgotPasswordOpen`, §8.1; with `enabled` off, approvals are refused too, §6.2)                                                                                                                                                                                                                                                                                                                                                                                                   |
| Failures                 | `sendEmail()` maps outcomes (success 200; 429 or network: retry; 400/404: setup problem; 401/403: key or origin not allowed; 412/5xx: provider rejected). After **3 consecutive failures** sending pauses until a `super_admin` clears it (shows `lastError`)                                                                                                                                                                                                                         |
| Bad addresses            | An admin marks an address unusable (`emailInvalid`); the app skips it with a reason. Many students have no real address: those accounts are never emailed                                                                                                                                                                                                                                                                                                                             |
| Public key               | The EmailJS public key, service id and template ids are visible to every admin's browser; anyone with them could call EmailJS and send text from the institution's mailbox. **No allowed-domains list is assumed:** EmailJS's pricing page lists the whitelist under the paid Personal plan, and its reCAPTCHA support is version 2 only (a visible challenge, unsuitable for an admin-triggered send), so the key is treated as public. Leave "non-browser applications" off, and use the allow-list only if the account's Security page offers it (§11). The provider's own monthly cap is the real stop; the counters constrain honest use. Under EmailJS's terms **the account holder is solely responsible** for every message |
| Forgot-password endpoint | Public create is the only unauthenticated write: one document per `institutionId__email` (§9), a bounded payload (email and a 200-character note), App Check, and no read access, so it cannot be used to list or probe accounts (§8.1 states exactly what this does and does not bound)                                                                                                                                                                                              |

### 8.1 The public Forgot Password endpoint, and the Google Workspace mailbox

**What the public create does and does not bound.** `password_requests` accepts a write from a **signed-out** visitor. The deterministic id (`institutionId__email`) means the **same email** can only be written again after the one-hour cooldown, and only when its earlier request is closed. It does **not** limit **different** emails: each distinct address is a separate document and a separate write. Spark has **no overage**: after about 20,000 writes in a day, writes stop for the whole app until the daily reset. A script that sends many different addresses (with a valid App Check token) could therefore exhaust the day's writes for every institution. The public registration form carries the same exposure today; this spec adds a second path, so it adds controls:

1. **Firestore App Check enforcement must be switched on** in the Firebase console, **in stages** (§11). The client already initialises App Check with reCAPTCHA v3 when a site key is set, but without enforcement the token is not required. Enforcement can also reject real users (an ad blocker or privacy mode that blocks reCAPTCHA, a low score) and every environment without a token (local development, e2e runs, Vercel previews), so: (a) first watch the **verified-request ratio** in the console with enforcement off; (b) provision a **debug token** for development, e2e and previews (`firebase.ts` supports one for DEV builds only, so previews need their own); (c) enforce only when the ratio is high and the debug tokens work; (d) keep a **rollback**: switch enforcement off in the console (no deploy) if sign-ins or the login page's directory read start failing.
2. **A per-institution kill switch without a deploy:** the create rule reads the institution's directory entry and requires it to exist **and have `forgotPasswordOpen == true`** (two billed `get()` reads inside the rule per create: the directory entry and the email settings, §9). The flag is **closed until the email setup is tested**: the first time it is set to `true` needs a `super_admin`, and the rules check that `email_settings/config` exists with `enabled` and a `testedAt` (§9, §11), so an institution without working email never accepts requests. An `institution_admin` (their own institution) or a `super_admin` flips the flag, **primarily from a bar at the top of the Password requests page** (below), and also from the Institution Profile page and, for a `super_admin`, the Email settings card; the login page hides the Forgot link and the page shows a closed message (§4.3, §6.2). This stops both abuse and a runaway of junk writes.
3. **Usage alert** (the next subsection): a daily routine against a stated threshold and an in-app request counter, because Spark cannot send an alert for you.
4. **Small documents:** the key set, the email length and the 200-character note bound each write; nothing in the request can be read back by the public.

#### Usage alert

**Spark has no billing account, so Firebase cannot send a budget or usage alert for Firestore** (verify in the console under Usage and billing). The spec therefore uses two controls and one named set of thresholds.

| Constant                  | Value  | Meaning                                                                                                                                                                                                      |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WRITE_ALERT_PERCENT`     | **70** | The share of the daily Firestore **write** quota that triggers action: 70% of Spark's 20,000 writes a day is **14,000 writes in a day**. Reads are watched at the same share of their 50,000 a day (35,000). |
| `WRITE_CLOSE_ALL_PERCENT` | **90** | At 90% (18,000 writes) the Forgot password form is closed for **every** institution.                                                                                                                         |
| `REQUESTS_PER_HOUR`       | **30** | Forgot-password requests in **one hour for one institution** that count as abnormal (a school of a few hundred people has a handful a day).                                                                  |

The constants live together in `src/lib/loginEmail/limits.ts` and are initial guesses, to be tuned after the first weeks of real use.

**Control 1: a daily routine (owner).** While the feature is live (and after any bulk import or registration push), the platform owner opens **Firebase console, Firestore, Usage** once a day at a fixed time and reads the day's writes and reads (Spark's daily quotas reset at midnight Pacific time, so read it before then as well as after). Action ladder:

1. **At 70%** (14,000 writes): open `password_requests` ordered by `requestedAt`, find the institution(s) driving it, and set `forgotPasswordOpen: false` for them (Institution Profile or the Email settings card).
2. **At 90%** (18,000 writes): close it for every institution.
3. **The next day:** investigate (distinct addresses from one source suggests abuse), confirm App Check enforcement is on (§11), and reopen one institution at a time.

**Control 2: an in-app counter, in two places.** On the **Password requests page** an `institution_admin` sees a bar at the top for **their own institution**; the `super_admin` Email settings card shows the same figures for **every** institution. Both are described below. For each institution the figures are **Forgot password requests: last hour / last 24 hours**, from two `getCountFromServer` queries (`institutionId` equality plus a `requestedAt` range; a composite index `institutionId` + `requestedAt` is added to `firestore.indexes.json`). They run **only when the card opens** (no listener, about one read per 1,000 index entries and at least one). The "last hour" figure turns **amber at `REQUESTS_PER_HOUR`** with the text "Unusual number of requests. Consider closing the form." and a one-click **Close Forgot password** button that writes `forgotPasswordOpen: false`. The count is of documents (one per person; a repeat after the cooldown updates the same document's `requestedAt`), so it measures distinct addresses.

**The bar on the Password requests page (`institution_admin`, own institution).** It sits above the request list and shows: **Forgot password: Open** or **Closed** (with "Closed by {name} on {date}" when closed); **requests in the last hour** and **in the last 24 hours** (the same two count queries, own institution only, run when the page opens); the amber warning at `REQUESTS_PER_HOUR` (30) with "Unusual number of requests. Consider closing the form."; and a **Close** or **Reopen** button.

- **Closing asks for confirmation.** A small dialog says: "People will not be able to ask for a password reset from the login page until you reopen this. Requests already received are not affected." with **Cancel** and **Close**. Reopening needs no dialog.
- **Who may close and reopen:** the `institution_admin` (own institution) and the `super_admin`, **either one, in both directions** (no separate owner lock for now).
- **What is written:** `forgotPasswordOpen` on the **public** directory entry (so the login page and the create rule can read it), and, **privately** on the institution document (`institutions/{id}`, which an `institution_admin` already updates), `forgotPasswordClosedBy` (uid) and `forgotPasswordClosedAt` (timestamp) so the bar can show who closed it without putting a name or uid on a public document. Both are written in one batch **together with an audit entry** (`forgot_password_closed`, §10.1); reopening sets `forgotPasswordOpen: true`, clears the two fields and adds a `forgot_password_reopened` audit entry in the same batch. The same applies when a `super_admin` flips it from the Email settings card or Institution Profile.
- The same bar component is used by the Email settings card, so the behaviour is identical there.

**Not built now:** an automatic circuit breaker that closes the form by itself past the threshold (it would only work while the owner's machine is running the script); see §16.

**Google Workspace mailbox (GENR8-3D Academy).** The institution's EmailJS service uses the **Gmail** service on a **Workspace** mailbox on its own domain.

| Point           | What it means                                                                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sending limit   | A Workspace account is limited to roughly **2,000 messages a day** (a personal Gmail account to about 500), a limit set by Google, not EmailJS. EmailJS's **200 requests a month** on the free plan binds first, so the daily limit is not a constraint for this feature.           |
| From address    | The Workspace address connected to the service (for example `office@your-domain`). EmailJS's **From Name** shows the institution's name; Reply-To is `{{reply_to}}`.                                                                                                                |
| Authentication  | The mail is sent through Google, so **SPF and DKIM already align to the institution's domain** when the domain's Workspace records are in place; no relay or extra DNS is needed.                                                                                                   |
| Connection      | EmailJS holds a Google OAuth grant for the mailbox. If an admin revokes it, changes the account password, or a Workspace policy blocks third-party apps, sends fail (a 4xx from EmailJS) and three failures in a row pause the feature (§8). Re-authorise in the EmailJS dashboard. |
| What is visible | Messages sent through the API appear in the mailbox's **Sent** folder; replies arrive in its inbox. Keep the mailbox monitored.                                                                                                                                                     |

### 8.2 EmailJS plan facts, capacity and link domain

**What the EmailJS documentation says** (checked 2026-10-05; re-check before relying on a number):

| Point | Fact | Consequence |
| --- | --- | --- |
| Free plan | 200 requests a month, **2 templates** (this design uses 1), 50 KB per request, **7-day** data retention, 1 request per second | The monthly count is the binding limit (§8) |
| Personal plan | About $9 a month: 2,000 requests, 6 templates, 30-day retention, and the **whitelist** (allowed domains) is listed with it | The upgrade path when 200 is not enough |
| Template variables | Every field except Settings accepts variables; `{{x}}` escapes HTML, `{{{x}}}` does not; **conditional sections** `{{#x}}...{{/x}}` and `{{^x}}...{{/x}}` exist; 50 KB limit on the variable data | One template can serve Self and Guardian (§7.4) |
| reCAPTCHA | Version 2 only (`g-recaptcha-response`) | Not usable for admin-triggered sends; not used |
| Allowed domains | Under Account > Security; the pricing page does not list it for Free | Not assumed; check the account (§11) |

**Capacity planning.** Every first-login, resend and forgot-password email is one request, and 200 a month is for the whole institution. Write down GENR8-3D Academy's expected numbers before launch: students, parents and teachers to be emailed in the first month, plus a few resends and forgot-password emails a week. A bulk import of several hundred students **cannot all be emailed in one month on the free plan**; the import's email step stops at the monthly limit and reports how many were left (§5.2), and the rest wait for the next period or are handed over by hand. **Upgrade trigger:** when the 80% warning (160 requests) appears in two months out of three, or an import is cut short, move that institution's EmailJS account to Personal (2,000 a month).

**The link domain.** The email's sender is the institution's own domain, but the link goes to the app's domain. Spam filters weigh a **mismatch**, and a shared or low-reputation host domain (for example a `*.vercel.app` address) counts against the message. Prefer a **custom domain for the app** (ideally a sub-domain of the institution's or the platform's own domain) and set it as `VITE_APP_URL` before launch; the link and the logo both use it.

---

## 9. Firestore rules and free-tier cost

**New rules blocks:**

- `institutions/{id}/email_settings/config`: read by that institution's admins and `super_admin`; create and delete by `super_admin`; update by `super_admin`, or by that institution's `institution_admin` only when `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['enabled'])`.
- `institutions/{id}/email_settings/config` **test invalidation:** an update that changes any value under `emailjs` is allowed only when the new document has **no** `testedAt` or `testedBy` (the save clears them), so a stale test can never vouch for new ids; `testedAt` and `testedBy` can be written only by a `super_admin`, and only by the Send test email action.
- `institutions/{id}/email_usage/{periodId}`: read by that institution's admins and `super_admin`; create (first send of a period) with `total == 1`; update only by +1 or −1 and never below 0, plus `consecutiveFailures` and `lastError`; `super_admin` may clear the failure count.
- `institution_slugs/{slug}`: **public read** (so a link can be resolved, though the login page uses the directory); **create** by `super_admin` only, with exactly `institutionId` and `createdAt == request.time`, and the slug matching the format in §3; **no update, no delete** by anyone from a client. A second create on an existing slug is an update and is refused, which makes the slug unique. Because the read is public, the Create Institution form's availability check (`findFreeSlug`, §3.1, a documentId `in` query of up to five candidates) needs no extra rule.
- `password_requests/{requestId}`:
  - **create** by anyone (including signed-out) only when **all** of these hold:
    - `requestId == request.resource.data.institutionId + '__' + request.resource.data.email`;
    - `status == 'requested'` and `requestedAt == request.time`;
    - the key set is exactly the public fields (`institutionId`, `email`, `note` optional, `status`, `requestedAt`; no `targetUid`, no `approvedBy`);
    - `email` is **already normalised** (`email == email.lower()` and `email == email.trim()`, string methods the rules language provides), has 5 to 254 characters and matches a simple address pattern (`email.matches('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$')`);
    - `institutionId` is a string of at most 40 characters **and its directory entry exists and has `forgotPasswordOpen == true`** (`get(/databases/$(database)/documents/registration_directory/$(institutionId)).data.get('forgotPasswordOpen', false) == true`) **and `institutions/{institutionId}/email_settings/config` exists with `enabled == true` and `testedAt` set** (`get(/databases/$(database)/documents/institutions/$(institutionId)/email_settings/config).data.testedAt != null`), so a form left open by a direct console edit still refuses requests once the settings are untested; **two billed reads per create**;
    - `note`, if present, is a string of at most 200 characters (control characters are stripped by the client and shown escaped by the admin screen);
  - **update by the public** (a repeat request) only when the stored `status` is terminal (`rejected`, `cancelled`, `skipped`, `expired`, `sent`, `send_failed`, `reset_failed`) **and** `resource.data.requestedAt < request.time − 1 hour`, **or** when `resource.data.requestedAt` is more than **14 days** old whatever the status (a request nobody actioned, §6.4), with the same public key set and `status == 'requested'`;
  - **read** and every other update or transition by that institution's `institution_admin` (queries filter on `institutionId`) and `super_admin`; `reset_done`, `reset_failed` and the heartbeat are written by the script through the Admin SDK (rules do not apply); moving a request to `approved` must set `approvedBy`, `approvedAt`, `verifiedBy`, `verifiedAt` and `verifiedMethod` together, with `verifiedBy == request.auth.uid`; no deletes from a client (`scripts/cleanup-password-requests.mjs` deletes through the Admin SDK);
  - indexes: `institutionId` + `status` + `requestedAt` in `firestore.indexes.json`, and `institutionId` + `requestedAt` for the request counter's count queries (§8.1).
- `platform_config/password_script`: readable by **every signed-in admin** (`institution_admin` or `super_admin`; it holds only a time, a mode and two counts, no personal data), so the Password requests page can show when the script last ran; written only by the script.
- `institutions/{id}/audit_log` (an **existing** rule, extended): the literal event-type list for an `institution_admin` or `super_admin` gains `forgot_password_closed` and `forgot_password_reopened` (and, if they are built, `credentials_emailed`, `password_request_approved`, `password_request_rejected`); the teacher list is unchanged. The new types are also added to `AuditEventType`, `auditRules.test.ts` and `auditEvents.ts` (§10.1).
- `users/{uid}`: `credentialsEmailedAt`, `credentialsEmailCount`, `emailInvalid`, `passwordIsRoleDefault`, `defaultPasswordConfirmedBy` and `defaultPasswordConfirmedAt` are written by the existing admin update clause (an `institution_admin` within their institution, never for another `institution_admin`); the owner allow-list and `passwordFlagOk` are unchanged, so **an owner cannot write them**; `profileEditDiff` ignores these fields so no `profile_edit` audit entries are created.
- `users/{uid}` **date of birth** (new, §5.4): a **create** with `role == 'student'` requires `dateOfBirth` to be a string of 10 characters matching `^\d{4}-\d{2}-\d{2}$`; an **update** of a student may not remove `dateOfBirth` or set it to null or an empty string (`!(resource.data.get('dateOfBirth', null) is string) || (request.resource.data.get('dateOfBirth', null) is string && request.resource.data.dateOfBirth.matches('^\\d{4}-\\d{2}-\\d{2}$'))`: the condition applies only when a date is already stored, so a legacy student whose `dateOfBirth` is missing or null can still be edited for other reasons until a date is added, and once a date exists it can only be replaced by another valid one). Other roles are not affected. The Admin SDK scripts bypass this rule and must be updated by hand.
- `registration_directory/{id}.forgotPasswordOpen`: written by the existing directory write rule (that institution's admin or `super_admin`), with one added condition: **setting it to `true` requires** `get(/databases/$(database)/documents/institutions/$(institutionId)/email_settings/config).data` to exist with `enabled == true` and `testedAt` set, and **the first time** (while the field is absent) **only a `super_admin`** may do it; setting it to `false`, or back to `true` afterwards, is allowed to that institution's admin or `super_admin`. The private `forgotPasswordClosedBy` and `forgotPasswordClosedAt` on `institutions/{id}` are written by the existing institutions update rule (that institution's admin or `super_admin`, in one batch with the directory flag); rules tests cover that the batch succeeds for both roles and is refused for another institution's admin.

**Two existing rules are tightened (not widened) so a slug can never change once set.** Both use `getAfter()`, which sees the state **after** the batch, because a plain `get()` would see the state **before** it (the repo's photo rules already document this trap), and the slug, its reservation and the directory entry are written in one batch:

- `institutions/{id}` **update** gains: either the request does not touch `slug` (`!('slug' in request.resource.data.diff(resource.data).affectedKeys())`), **or** the institution has **no slug yet**, the caller is a `super_admin`, the new slug matches the format in §3 and `getAfter(/databases/$(database)/documents/institution_slugs/$(request.resource.data.slug)).data.institutionId == institutionId`. Once a slug exists **nobody, including `super_admin`, can change or remove it** from a client. An `institution_admin` may still update every other field.
- `registration_directory/{id}` **write** gains: either `slug` is unchanged (for example the existing merge writes from `RegistrationDirectoryToggle` and `InstitutionForm`, which never send a different value), **or** the entry has no slug yet, the caller is a `super_admin`, and `getAfter(/databases/$(database)/documents/institutions/$(institutionId)).data.slug == request.resource.data.slug`, so the directory can never carry a slug different from the institution's. `forgotPasswordOpen` and every other field stay writable by that institution's admin as today.
- A rename, if ever wanted, is not possible from a client (§16); it would be an owner-run script plus a redirect table.

Both changes need rules tests (§13) and a check that the existing admin pages (Institution Profile, the registration toggle, the Create Institution form) still save.

**Free-tier cost (Spark).** Per email: one user-document write and one counter write; settings read once per session and cached; the slug lookup uses the directory the login page already loads (no extra read). Per Forgot Password request: one public create (plus two billed `get()` reads inside its rule: the directory entry and the email settings), a few small status updates, one account lookup query when an admin opens the request, and a `getDocs` when the Password requests page opens (no standing listener). The request counters on the Password requests page and on the Email settings card each add two count queries when they open (about one read per 1,000 index entries and at least one each). `scripts/cleanup-password-requests.mjs` reads and deletes closed requests through the Admin SDK, a few documents a month. One slug reservation write per institution created, and one small availability query per pause in typing on the Link name field (a read only for each slug that already exists, so a free slug costs nothing beyond the query; super_admin-only, a few times in the life of an institution). The script runs on the owner's machine with the service account; its reads and writes are the same few documents. At under about 100 accounts a month this is a few hundred writes against Spark's 20,000 a day. No Cloud Functions, no Hosting changes, no Blaze-only feature. Per first-login email, the guardian click adds one query plus one read per linked parent, for a young student only. A confirmation of the standard password is one user-document write. **Risk:** the unauthenticated create can be spammed to burn daily writes; the deterministic document id and the one-hour cooldown bound only repeats of the **same** address, **not** different addresses. What actually bounds it is App Check **enforcement** (to be switched on), the small payload, and the per-institution `forgotPasswordOpen` kill switch that stops the endpoint without a deploy (§8.1). Firebase Auth rate-limits sign-in attempts itself (`auth/too-many-requests`).

---

## 10. Legal and privacy notes (this scope)

Not legal advice; see `docs/compliance/` for the full Jamaican-law and provider analysis.

- **Who is the controller is an open question for counsel.** The first draft of this section said the institution's own EmailJS account makes the institution responsible; `docs/compliance/LEGAL_AND_PRIVACY_COMPLIANCE.md` decided the **platform is the sole data controller**. Both cannot stand. Either the platform is the controller and the institution's EmailJS account and Google Workspace mailbox are processors held on its behalf (the Privacy Notice and the institution agreement then name EmailJS and Google as processors), or the institution is the controller for these emails (the fallback model in that guide). Until counsel decides, the spec does not state either; the terms that apply regardless are EmailJS's (solely responsible for messages, no spam, 7-day or 30-day history depending on plan, a logging option, US servers) and Google's. The email contains name, address and institution only (no password).
- **Children:** a student under the guardian threshold is emailed through a guardian (who also receives the student's sign-in address); the threshold is a setting so counsel can change it.
- **The Forgot Password form** collects an email address and an optional free-text note from a signed-out visitor: say so in the Privacy Notice, show a **short collection notice on the form itself** (§6.4), keep the note out of any log, and delete requests after 90 days (§6.4). Update `docs/compliance/PRIVACY_NOTICE.md` and `COMPLIANCE_REVIEW.md` for the Forgot form, the retention period, EmailJS and the Workspace mailbox as processors.
- **Transfers:** names and addresses go to EmailJS's US servers; disclose in the Privacy Notice (`docs/compliance/PRIVACY_NOTICE.md`).
- **Recipient has not agreed to anything when the first email arrives:** the email says why it was sent and who to contact; acceptance of the Terms is a separate item (`EMAIL_INTEGRATION_SPEC.md` §12.3) and is not built here.

### 10.1 Audit (three event types required, the rest optional)

Sends and request decisions could be recorded in `institutions/{id}/audit_log`: `credentials_emailed` (who emailed whom, when; never the password or the recipient's address), `password_request_approved` and `password_request_rejected`. `password_reset` already exists and is written by the script. If any new type is added, it must be mirrored in `AuditEventType` (`src/lib/firebase.ts`), `firestore.rules`, `src/lib/__tests__/auditRules.test.ts` (it fails when they drift) and `src/lib/auditEvents.ts` (labels), per the existing audit design. Confirming a standard password (§3) is also worth an entry. **Three audit types are not optional:**

- **`account_email_corrected`**, written by `scripts/audit-account-emails.mjs --fix --live` with a `detail` that holds no address (§5.5);
- **`forgot_password_closed`** and **`forgot_password_reopened`**, written by the admin's browser **in the same batch** as the `forgotPasswordOpen` change (§8.1), so the flag and its record cannot get out of step. They carry `performedBy`, `performedByName` and `recordedAt` as every audit entry does, `targetUid` and `targetName` empty, and a `detail` of "Forgot password form closed" or "Forgot password form reopened" (no personal data). The existing audit rules allow an `institution_admin` or `super_admin` to write only a **literal list** of event types (§2), so the list in `firestore.rules` must be **extended** with these two types (an `institution_admin` for their own institution, a `super_admin` for any), and `auditRules.test.ts` fails until it matches `AuditEventType`.

All three are mirrored in `AuditEventType` (`src/lib/firebase.ts`), the event-type lists in `firestore.rules`, `src/lib/__tests__/auditRules.test.ts` and `src/lib/auditEvents.ts` (labels such as "Forgot password closed"), so the drift test and the audit screens stay consistent. The other entries above (`credentials_emailed`, the request decisions, confirming a standard password) remain optional for the first release.

---

## 11. Configuration (before any code)

**EmailJS (GENR8-3D Academy):** (1) the service is connected and sends from the institution's mailbox; (2) create the **one** template (§7.3; its guardian sections are described in §7.4), note its id, and **verify** that `{{^is_guardian}}` renders when the variable is empty or omitted and that a send without `is_guardian` is accepted; (3) set the From name, Reply-To and `{{subject}}` as in §7.1; (4) **turn activity logging off** in each template; (5) **check whether the account's Security page offers an allowed-domains list on its plan** (the pricing page lists it under Personal) and, if it does, allow only the live site's domain (and localhost and preview origins as needed); leave "non-browser applications" off; reCAPTCHA is version 2 only and is not used; (6) note the public key, service id and the **billing date** (`periodStartDay`); (7) send a test from the dashboard to a Gmail, Outlook and school mailbox and check From, Reply-To, spam placement, that the icon shows, and that the link opens the right page; (8) check the template **Settings** for an activity-history option and whether EmailJS sends a plain-text alternative, and record both answers in the runbook.

**App and data:** `VITE_APP_URL` (canonical live URL, so emails never carry localhost or preview links) and `VITE_EMAIL_ENABLED` (false everywhere except production; QA specs create real `@demo.com` accounts) in `.env.example` and Vercel. `super_admin` creates `institutions/{id}/email_settings/config` from the Email settings card. Move the role defaults to `src/lib/roleDefaultPasswords.ts`. **Give every existing institution a slug** (GENR8-3D Academy first) with `scripts/backfill-institution-slugs.mjs` (dry run by default, `--live` to write; it uses the same `suggestSlug` algorithm as the form (§3.1), numbers clashes, and writes the reservation document, the institution and the directory entry together). A `super_admin` can instead set an institution's link name once from the "Link name" field on Institution Profile; use whichever is quicker for GENR8-3D Academy, and check the printed or previewed slug before saving because it is permanent.

**Reset script:** Node, `firebase-admin` (already a dev dependency) and a service-account key at `scripts/service-account.json` (gitignored, local only); `--live` (dry run is the default), `--watch`, `--key=<path>`; it sets `passwordIsRoleDefault: true` with the reset, and `scripts/reset-role-default-passwords.mjs` is updated the same way; runbook in the docs update (§14).

**Checks before building:** the template variables are honoured (From name, Reply-To, `{{subject}}`, escaping of `{{double}}` braces); the app icon loads in each client and reads well on the dark header; the path link survives Gmail, Outlook (including Safe Links) and Apple Mail; EmailJS refuses a request from an unlisted origin.

**Google Workspace mailbox (GENR8-3D Academy):** (1) in EmailJS, add the **Gmail** service and sign in as the Workspace mailbox that should send (a shared office address is better than a person's), and approve the permissions; (2) confirm the From address shown in EmailJS is that mailbox and the From Name is the institution's name; (3) send a test and confirm it appears in the mailbox's Sent folder and that a reply returns to `{{reply_to}}`; (4) confirm the domain's SPF and DKIM records for Workspace are in place (Google Admin console, Gmail authentication) and publish DMARC at least at `p=none`; (5) check that Workspace allows third-party app access for this mailbox (Google Admin console, API controls); (6) note how to re-authorise the service after a password change; (7) the mailbox's daily limit (about 2,000) is not the constraint; EmailJS's 200 a month is.

**Firebase console (once, before launch):** (1) **roll out App Check enforcement for Firestore in stages** (§8.1): confirm the reCAPTCHA v3 site key is registered for the live domain, watch the verified-request ratio, provision debug tokens for development, e2e and previews, enforce, and keep the rollback step; (2) put the **daily usage routine** in the runbook with the thresholds in §8.1 (70% of the daily write quota, 14,000 writes; close for everyone at 90%, 18,000; 30 requests an hour per institution), since Spark cannot alert; (3) deploy the rules and indexes in the order the PR body gives, with the **date-of-birth rule last**, after the existing students have been checked.

**No allowed-domains list is assumed.** If the account's plan offers one, add the live site, local development and the preview origins to it; if it does not, the public key is exposed to anyone who can open the app's network traffic (§8) and the controls are the caps, the failure pause and EmailJS's own monthly limit. `VITE_EMAIL_ENABLED` stays false in development and previews, so this only matters when testing a real send there.

**Send test email and opening the Forgot password form (`super_admin`).** The Email settings card has these fields: `enabled`, the EmailJS public key, service id and template id (each trimmed and non-empty; the public key and ids are checked for plausible length and characters), `replyTo` (a valid address, defaulting to `institution.email`), `portalName`, `monthlyLimit` (a positive integer, default 200), `periodStartDay` (1 to 31) and `guardianAgeThreshold` (default 16, between 3 and 21). A **Send test email** button sends one message through the configured service to an address the `super_admin` types, using sample data and `is_guardian` empty (and a second option with it set), counts as one request, and on success writes `testedAt` and `testedBy`. **The Forgot password form can be opened only after a successful test** (§9). The card also shows the request counters and the usage panel (§8.1).

**Editing the EmailJS settings invalidates the test.** Changing the public key, the service id, the template id or the optional guardian template id (not `replyTo`, `portalName` or the limits) **clears `testedAt` and `testedBy` and closes the Forgot password form** (`forgotPasswordOpen: false`, with a `forgot_password_closed` audit entry whose `detail` is "Forgot password form closed because the email settings changed") **in the same batch** as the save, and the card says "Send a test email to open the form again." The form reopens only after a new successful test and an explicit action by the `super_admin` (the first-opening rule in §9 applies again, because the flag was cleared). The rules enforce the first half: an update of `email_settings/config` that changes anything under `emailjs` must not contain `testedAt` (§9).

**Cleanup of password requests:** run `scripts/cleanup-password-requests.mjs` (dry run first, then `--live`) regularly, for example weekly: it marks requests left open for more than 14 days `expired` and deletes closed requests older than 90 days (§6.4).

**Custom domain for the app link:** set up a custom domain for the app and use it as `VITE_APP_URL` before sending real email (§8.2).

**Account email audit:** run `scripts/audit-account-emails.mjs` once before launch and whenever an account's address is questioned: first as a report, then `--fix` as a dry run (the default), read the table, then `--fix --live` (use `--institution=<id>` for the first live run). Auth is treated as correct and only Firestore `users.email` is rewritten; a backup log is written to `scripts/logs/` and an `account_email_corrected` audit entry per fix (§5.5).

---

## 12. Separation of concerns

| Who                                   | Owns                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Does not touch                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **super_admin** (platform owner)      | The institution's email settings document and Reply-To; the monthly limit; **institution slugs**; the service-account key; **running the reset script**; clearing a 3-failure pause; flipping the Forgot password switch (`forgotPasswordOpen`) for any institution; running the account-email audit and the request cleanup; running the test send and opening the Forgot password form for the first time                                                                                                                                                                             | The institution's mailbox or EmailJS account                                 |
| **institution_admin**                 | Its people and addresses; approving (with the verification tick and method) or rejecting Forgot Password requests; **sending** first-login and forgot-password emails; switching its own sending on and off; marking bad addresses; **confirming that an account uses the standard password**; entering every student's date of birth; opening or closing its own Forgot password switch (from the bar on the Password requests page); handing credentials over by hand when email is blocked | EmailJS ids, caps, slugs, password resets                                    |
| **The institution's EmailJS account** | The one template (the second free slot is spare), the connected mailbox, its monthly allowance, its allowed-domains list if its plan has one, and its terms                                                                                                                                                                                                                                                                                                                                                                               | App data                                                                     |
| **The app**                           | Eligibility, link building and parsing, payload building and escaping, the counter and limits, the request flow, the confirmation modal and statuses                                                                                                                                                                                                                                                                                                                             | Sending as the institution without its settings; resetting a password itself |
| **The reset script**                  | Authoritative re-validation, the password reset, token revocation, the audit entry, the status and heartbeat                                                                                                                                                                                                                                                                                                                                                                     | Sending email, limits, settings                                              |

---

## 13. Testing

- Standing gate: `npx tsc -b`, `npx eslint .`, `npx vitest run`, `npm run build`.
- **Unit:** `suggestSlug` (accents, apostrophes, symbols and punctuation, repeated and leading or trailing separators, the 36-character cut at a whole word, reserved words, an empty or too-short result, non-Latin names), `validateSlug` (format, length, hyphen rules, reserved words), `findFreeSlug` (none taken, the base taken, several taken, all five taken; the query is built once), a **parity test** that runs the app's `suggestSlug` and the script's copy over a fixture list and requires identical output, and the link builder and parser (valid slug and role, unknown slug, unknown or empty role code, extra path segments, trailing slash, upper-case input); `loginEmailEligibility()` (every row of §5.1, each role, `mustChangePassword` true, false and missing, no slug, guardian rule by age and by linked guardian, `emailInvalid`, the 12-email cap, the 24-hour cooldown, reason order); `resolveEmailSettings()` (every block reason, the period id for days 29-31); payload builders (every variable present and named exactly as in §7.2 for the one template, with `is_guardian` empty (Self) and set (Guardian), the wording table for all four combinations, `account_email` is the student's address for a guardian, escaping of `<`, `&` and quotes, no password anywhere, `login_url` shape, `logo_url` constant); the failure mapper; the usage counter (reserve, compensate, 80% warning, three-failure pause); the script's pure validator (each rule in §6.2 step 5); the request state machine.
- **Component (Link name):** on `InstitutionForm` and the Institution Profile field: a blank Link name blocks saving ("Type a link name.") and an empty suggestion (non-Latin name) leaves it blank; an `institution_admin` sees the three sign-in links and Copy buttons and no editable field; clicking Copy puts exactly the bare URL on the clipboard, shows "Copied", and resets after about two seconds; the field follows the name until the `super_admin` types in it and stops following afterwards; a suggested slug that is taken moves to the next free number and says so; a typed slug that is taken is not changed and offers the one-click alternative; the preview shows `…/login/<slug>/student`; the permanent-choice note is shown; a refused batch shows "That link name was just taken"; Institution Profile shows the field editable only for a `super_admin` on an institution with no slug, and read-only otherwise.
- **Component:** `LoginPage` first-login mode (institution preselected from the path, password box absent, submit signs in with the role default and writes the pending institution; wrong password reveals an empty box; "I already have my own password" link; first failure not counted; **Forgot password?** link visible in every mode and carrying the slug); the forgot-password page and **modal** (Submit opens the modal and writes nothing; Continue is disabled until the tick-box is ticked; Escape and Cancel close it without writing; Continue writes once; the same neutral message for every outcome; the note is capped at 200 characters).
- **Rules tests:** every block in §9, including a signed-out create (allowed with the exact key set, id and a note of 200 characters or fewer; refused with extra fields, a mismatched id, a 201-character note or a stranger's `targetUid`), a repeat request refused before an hour and while open, refused reads for everyone but the institution's admins and `super_admin`, teachers, students and parents having no access, the slug reservation (create by `super_admin` only, refused on a duplicate, refused update and delete), and **slug immutability** on `institutions/{id}` and `registration_directory/{id}` (an `institution_admin` cannot change or remove it; the existing merge writes still succeed).
- **Live e2e (`e2e/17-login-emails.spec.ts`):** `/login/<slug>/student` shows the institution selected and no password box; signing in with the QA student (still at the default) reaches **Set a new password**; the same link for an account whose password was changed reveals the password box; an unknown slug shows the normal dropdown; with Playwright intercepting `https://api.emailjs.com/**` (no real request leaves the machine) a creation-time send and a Forgot Password send carry the right To, From name, Reply-To, subject, template id, `is_guardian` and link once; `/password/forgot/<slug>` shows the modal and then the neutral message for both a real and an unknown address. The script itself is not run in e2e; an Admin SDK write simulates `reset_done`. Never send real email from automated specs.
- **Added by the consistency review (§1.1):**
  - **Unit:** `loginEmailEligibility` in all three modes, reason by reason (the §5.1 table: the marker rule, a missing and a null `dateOfBirth`, `forgot-approve` skipping the `mustChangePassword`, marker, cooldown and sender reasons, `forgot-send` after a reset, reason order); the marker writers (creation with the default, creation with an edited password, import, the script, the admin confirmation with `defaultPasswordConfirmedBy/At`); the date-of-birth validator (real date, not in the future, age 3 to 100, format, the import column now required); the guardian lookup (none linked, one linked, several linked and the picker, a linked parent with no address or `emailInvalid`); `suggestSlug` for a 54-character name (cut at 36 at a whole word) and a reserved word that still exceeds the limit after `-school`; `findFreeSlug` skipping a candidate that fails `validateSlug`; a **role-default sync test** that reads `ROLE_DEFAULT_PASSWORDS` from `src/lib/roleDefaultPasswords.ts` and compares it with the literals in `scripts/reset-role-default-passwords.mjs` and the import page; the script's pure validator skipping a request when `lastSignInTime` is later than `requestedAt`; the `audit-account-emails` comparison and fix planner (a match, a case-only difference, a real mismatch, trimming, no Auth user, an Auth user without an email, a document without an email; the last three are reported and never changed; a dry run writes nothing; `--fix --live` writes only `users.email`, set to the lower-cased Auth value, and never touches Auth; a second run finds nothing; `--institution` limits the scope; the backup log lists each change with old and new values; each fix adds an `account_email_corrected` audit entry whose `detail` contains no address); the request-counter helper (the 1-hour and 24-hour windows and their boundaries, amber at `REQUESTS_PER_HOUR` = 30, the Close Forgot password button writes `forgotPasswordOpen: false`); the usage-alert constants (`WRITE_ALERT_PERCENT` 70, `WRITE_CLOSE_ALL_PERCENT` 90, `REQUESTS_PER_HOUR` 30) and the derived write thresholds (14,000 and 18,000).
  - **Component:** the Students list shows the **Missing date of birth** badge and filter from the loaded rows; the Student edit form requires a date and cannot clear one; the Student and Parent edit forms show `email` read-only with the note and cannot save it blank (the Teacher form has no email field); the Create User form is unchanged; a row with a missing marker shows **Confirm standard password** and the dialog writes the marker once; Send for a young student runs the guardian lookup on click and shows the reason dialog or the picker; the Forgot link is hidden and `/password/forgot/<slug>` shows the closed message when `forgotPasswordOpen` is not `true`; the **Password requests page bar** shows Open or Closed (with who and when), the two request counts for the admin's own institution only after the page opens, the amber state at 30 an hour, a **confirm dialog** before Close (Cancel does nothing, Close writes `forgotPasswordOpen: false`, the private closed-by fields and a `forgot_password_closed` audit entry in one batch; Reopen writes `forgot_password_reopened` likewise) and a Reopen button that sets it back and clears them; both the `institution_admin` and the `super_admin` can close and reopen; the Email settings card shows the two request counts per institution only after it opens, turns the hour figure amber at 30 with the warning text, and the **Close Forgot password** button closes the form.
  - **Rules tests:** a student create without a valid `dateOfBirth` is refused (other roles unaffected); an update that clears an existing date is refused, an update of a legacy student with none is allowed; the six marker and email-state fields cannot be written by the owner but can by the institution's admin; `password_requests` create refused for a mixed-case or untrimmed email, a malformed address, a missing directory entry or one without `forgotPasswordOpen == true`, a missing, disabled or untested `email_settings/config` (no `testedAt`) even when the flag is `true`, an institution id over 40 characters; the slug rules with `getAfter()`: set once by `super_admin` with its reservation (allowed), set without the reservation (refused), changed or removed by `institution_admin` and by `super_admin` (refused), a directory slug that differs from the institution's (refused), `forgotPasswordOpen` still writable by the institution's admin; the three new audit types (`account_email_corrected`, `forgot_password_closed`, `forgot_password_reopened`) appear identically in `AuditEventType`, `firestore.rules`, `auditRules.test.ts` and `auditEvents.ts` (the drift test); an `institution_admin` can write `forgot_password_closed` and `forgot_password_reopened` for their own institution only, in one batch with the flag, and a `super_admin` for any institution; a teacher, student or parent cannot; the audit `detail` stays within 300 characters. An `email_settings/config` update that changes `emailjs` without clearing `testedAt` is refused, and one that clears it is allowed.
  - **Live e2e:** the e2e file is named `17-login-emails.spec.ts`; if the platform spec's `17-email.spec.ts` is ever built too, renumber one of them. Seed and QA students need a date of birth.
- **Added by the second review (§1.2):**
  - **Unit:** the one template rendered with a small Mustache-style renderer for all four combinations (first login or forgot password, Self or Guardian): no `{{`, `{{#` or `{{^` remains, each guardian-only phrase appears only when `is_guardian` is set, and an omitted `is_guardian` renders as Self; `loginEmailEligibility` in `forgot-approve` mode **checks** the cooldown, the lifetime cap and the sender (a blocked sender, a spent allowance or a backlog larger than the allowance refuses the approval) and in `forgot-send` mode skips the cooldown; the script's pure validator refuses a request that lacks `verifiedBy`, has expired, is inside the cooldown or is over the cap; the expiry helper (13 and 14 days, a `reset_done` request is never expired); the cleanup planner (expire at 14 days, delete closed ones at 90, never delete an open or `reset_done` one, a dry run writes nothing, the log holds no addresses); the usage counter uses `increment`; the capacity helper (the 80% warning at 160 of 200).
  - **Component:** `/login/<slug>` (no role) opens the normal form with the institution preselected and a visible password box; the login route shows a spinner, not the choice view, while the directory loads, and falls back to the dropdown if it fails; the Forgot link and page are hidden or closed when `forgotPasswordOpen` is not `true` (absent and `false` behave the same); the approval dialog needs the verification tick and a method and writes `verifiedBy`, `verifiedAt` and `verifiedMethod`; the Password requests page shows an expired request as expired and the heartbeat "script last ran"; the Email settings card validates each field, editing the public key, service id or template id clears `testedAt` and `testedBy`, closes the Forgot password form and writes the `forgot_password_closed` audit entry in one batch (editing `replyTo` or a limit does not), the **Send test email** button writes `testedAt` and `testedBy` on success and nothing on failure, and the Forgot form cannot be opened before it; the Forgot page shows the collection notice.
  - **Rules tests:** `password_requests` create refused when the directory flag is absent or `false`, allowed when `true`; a public re-request allowed after 14 days whatever the status, refused before the one-hour cooldown while an earlier request is open and recent; moving a request to `approved` refused without all five approval fields or with another uid in `verifiedBy`; `platform_config/password_script` readable by an `institution_admin` and `super_admin`, not by a teacher, student or parent; `registration_directory.forgotPasswordOpen` cannot be set to `true` without an enabled and tested `email_settings/config`, and the first time only by a `super_admin`; the audit-log event-type list accepts `forgot_password_closed` and `forgot_password_reopened` from an `institution_admin` and refuses them from a teacher.
  - **Sidebar and fixtures:** `sidebarNav.test.ts` has a row for Password requests (visible to `institution_admin`, hidden from every other role); `profileEditDiff.test.ts` no longer lists `email`; `e2e/00-setup-custom-institution.spec.ts` waits for the Link name to read "Available" before submitting; QA institutions have a slug and reservation; the seed and QA fixtures write the marker and a date of birth; the new pages behave correctly in `mock` and `blank` data modes (they show nothing to send and make no Firestore writes).
- **Manual (after §11):** one real first-login and one forgot-password email, Self and Guardian (`is_guardian` empty and set), to test mailboxes at Gmail, Outlook and a school domain.

---

## 14. Implementation order and docs

0. **`src/lib/roleDefaultPasswords.ts`** and its call sites (the Create User form, the import page, the login scene), moved ahead of everything else because the marker and the first-login mode both need it, with the sync test against the scripts' literals.
1. Checks and EmailJS template creation (§11), including the Workspace mailbox, the template's conditional-section check and the Firebase console items (App Check in stages).
   1a. **Data hygiene first (§5.4, §5.5), independent of email:** the date of birth required in the import, the Student edit form and the `users` rules (rules deployed **last**, after the existing students are checked); `email` read-only and not clearable on the Student and Parent edit forms (with `src/lib/profileEditDiff.ts` and its test; the Teacher form has no email field); `scripts/audit-account-emails.mjs` with its report and `--fix` modes (backup log, `account_email_corrected` audit type); the **three new audit event types** (`account_email_corrected`, `forgot_password_closed`, `forgot_password_reopened`) with their drift-test mirrors in `AuditEventType`, `firestore.rules`, `auditRules.test.ts` and `auditEvents.ts`; the "Missing date of birth" badge and filter; seed scripts and e2e fixtures updated.
   1b. **The marker (§3):** `passwordIsRoleDefault` written by the Create User form, Convert to accounts, the import, the seed scripts and `scripts/reset-role-default-passwords.mjs`; the confirm dialog; the rules tests for the new `users` fields.
2. **Institution slug:** `src/lib/institutionSlug.ts` (`suggestSlug`, `validateSlug`, `findFreeSlug`) with unit tests, the suggested "Link name" field on `InstitutionForm` and the one-time field on Institution Profile, the `institution_slugs` rules, the two tightened rules (with `getAfter()`) and their tests, `scripts/backfill-institution-slugs.mjs`, and the slug in `registration_directory`; the `forgotPasswordOpen` switch on Institution Profile.
3. `src/lib/loginEmail/` (settings, eligibility, link builder and parser, payload builders, `sendEmail()`, counter, failure mapper) with unit tests.
4. The login link: routes, parser, first-login mode, fallback, the always-visible **Forgot password?** link; component tests and e2e.
5. Settings and rules: `email_settings`, `email_usage`, rules and rules tests, the super_admin Email settings card (its fields and validation, the **Send test email** button and the first opening of the Forgot password form, §11), including the **request counter** (last hour and last 24 hours, amber at `REQUESTS_PER_HOUR`, the Close Forgot password button), `src/lib/loginEmail/limits.ts` and the `institutionId` + `requestedAt` index.
6. First-login email: creation tick-box, per-row actions with extended rows, import commit step.
7. Forgot Password: `/password/forgot/:slug`, the confirmation modal, `password_requests` rules and tests, the Password requests page (sidebar entry) with its **Open/Closed bar, request counts and Close / Reopen button with the confirm dialog** (§8.1), the script with its pure validator and runbook, the approval **verification tick**, the 14-day **expiry** and `scripts/cleanup-password-requests.mjs`, the readable heartbeat, the collection notice, the `/login/:slug` route and the directory loading state, the sidebar entry and its test, and the `mock`/`blank` data-mode behaviour.
8. Docs and a PR.

**Docs to update:** `docs/guides/USER_GUIDE.md` (the first-login email and link, Forgot password and its warning, the Password requests page, the Link name and how to copy the sign-in links, why a date of birth is required and the Missing date of birth filter, confirming the standard password, why the sign-in email cannot be edited, the Forgot password switch, limits and why sending can be blocked); a runbook for the reset script, the slug backfill script, the account-email audit and `--fix` procedure (report, dry run, `--live`, the backup log), the **daily usage routine and its action ladder** (§8.1) and EmailJS setup; `docs/login/LOGIN_ARCHITECTURE.md` (the `/login/:slug/:role` route, the hidden-password mode and its fallback, the unchanged institution gate); `docs/firebase/firebase-rules.md` and `MISCELLANEOUS_INFO.md` (new collections, rules, index, the tightened rules); `docs/miscellaneous-specs/ROLE_DEFAULT_PASSWORD_RESET_SCRIPT_SPEC.md` (cross-link and the sync note); `.env.example`; `docs/ISSUES_AND_GAPS.md` (limits in §8, the EmailJS facts in §8.2); `docs/compliance/PRIVACY_NOTICE.md` and `COMPLIANCE_REVIEW.md` (the Forgot form, retention, processors; and the open controller question, §10); `internal/regarding-emailjs/templates/regarding-welcome-template.md` replaced by the final template HTML.

---

## 15. Risks and limits

- **The link is a hint, not a secret:** it names the institution and role; the role default is public, so for the whole time an account sits at the default anyone who knows the address could sign in. This is unchanged from today; the email only makes it easier for the right person.
- **The slug is permanent:** a slug chosen badly at creation stays (changing it would break every email already sent), even if the institution is later renamed. The form shows the suggestion, the preview and a permanent-choice note; a deliberate rename would need a redirect table and its own change.
- **Names in a non-Latin script, symbols only, or under three letters** produce no suggestion; the `super_admin` must type a slug.
- **A confirmation of the standard password can be wrong:** an admin confirms an account by hand. If the password was in fact changed, the sign-in link opens the normal password box (§4.3 step 4) and the person is not stuck, but the email will not have worked as intended.
- **Legacy students without a date of birth are blocked** from emails until one is entered; at first the Students list may show many badges.
- **The date-of-birth rule and the Admin SDK:** rules do not apply to the seed and other scripts, so they can still create a student without one; update them by hand.
- **Spark write exhaustion:** the public Forgot Password create can be used to burn the day's writes with different addresses; App Check enforcement and the per-institution switch are the controls (§8.1).
- **No automatic usage alert on Spark:** the 70% / 14,000-writes routine depends on the owner checking the console daily, and the in-app counter shows requests only when the Email settings card is opened; an automatic circuit breaker is deferred (§16). The thresholds are initial guesses, to be tuned.
- **`--fix` rewrites documents with the service account:** it changes only `users.email`, never Auth; the dry-run default, the `--institution` scope and the backup log are the mitigations, and a corrected address that was in fact the wrong one has to be reversed by hand from the log.
- **EmailJS Free has no assumed allow-list and no reCAPTCHA you can use:** anyone who reads the public key from the app's network traffic can send mail through the institution's EmailJS account until its monthly cap or a failure pause stops it (§8).
- **App Check enforcement can lock out real users and environments** if switched on carelessly (§8.1): stage it, watch the ratio, keep the rollback.
- **The controller model is unresolved** (§10): the Privacy Notice, the institution agreement and this feature must agree before launch.
- **Capacity:** 200 requests a month is small for a whole school (§8.2).
- **Link domain reputation:** a shared host domain in the email's link lowers deliverability; use a custom domain (§8.2).
- **Requests expire and are deleted** (§6.4): a person who asked and was never answered must ask again after 14 days.
- **A suggestion can be unattractive** (`genr8-3d-academy`); it can be shortened by hand before saving, never after.
- **A mail wrapper that rewrites the path** (rare; the common wrappers keep the whole URL) would open a "not found" page or the normal login; the normal login still works and the email says who to contact.
- **Server logs now include the slug and role code** (both public, neither a secret).
- **Forgot Password depends on the owner's machine** and on an administrator; it is not instant. A hosted function would remove the script (see `EMAIL_INTEGRATION_SPEC.md` §15) and is the upgrade path.
- **The reset overrides the current password** and signs the person out; a failed email afterwards leaves the account at the default until a retry.
- **The service-account key** on the owner's machine can change any account's password: keep it local, gitignored and backed up safely; the script authorises each request itself and audits it.
- **Client-side limits are bypassable;** EmailJS's own monthly cap is the real control (no allowed-domains list is assumed, §8.2). The account holder is solely responsible for every message.
- **One template with conditional sections:** it is more complex to test than two plain ones, and its rendering of an empty `is_guardian` must be verified on the dashboard (§7.4); the second free slot is spare, and more fixed templates need the paid plan.
- **200 requests a month** per institution on free (about 200 new accounts if nothing is resent): a bulk import of several hundred students cannot all be emailed in one month (§8.2).
- **No self-service reset:** a person with no address on file, or who cannot reach their administrator, still goes to the administrator.
- **Public create endpoint** (Forgot Password) can be spammed; bounded by §9 and App Check. The optional note is untrusted text: show it escaped, never render it as HTML.
- **Children's data and cross-border transfer:** see §10 and `docs/compliance/`.

---

## 16. Deferred

Ideas deliberately **not** built in the first release. Each is listed with why it waits and what would bring it back.

| Item                                                      | What it would be                                                                                                                                                                                           | Why deferred                                                                                                             | Trigger or pointer                                                                |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| **Slug alternatives as chips**                            | Under the Link name field, the suggested slug plus up to four numbered chips (`slug-2` … `slug-5`) from the same `findFreeSlug` query, one click to choose (§3.1)                                          | The single suggestion plus the one-click "Taken. Try …" button is enough for a handful of institutions                   | `super_admin`s find themselves clicking the button repeatedly                     |
| **Automatic sign-in from the link (option B)**            | The link signs the person in on load and lands on "Set a new password" (§4.1)                                                                                                                              | A scanner that runs JavaScript could trigger it, and anyone holding the email signs in with no typed secret              | Can be added later without changing the template or the link format               |
| **Four fixed-wording templates**                          | First login and forgot password, each in a Self and a Guardian version, with the wording typed into the dashboard instead of passed as variables (§7)                                                      | With conditional sections one template already covers every case; separate fixed templates fit only as the one spare slot on the free plan, and more need EmailJS Personal (6 templates)                                                           | An upgrade of the institution's EmailJS plan                                      |
| **Confirmation email after the first password change**    | A follow-up "You have signed in and changed your password"                                                                                                                                                 | Not needed for the first release                                                                                         | `EMAIL_INTEGRATION_SPEC.md` §7                                                    |
| **Hosted function instead of the owner-run reset script** | A free server function that resets passwords and removes the dependency on the owner's machine                                                                                                             | Needs a host and a function; the script is enough for one institution                                                    | A second institution goes live or abuse is seen (`EMAIL_INTEGRATION_SPEC.md` §15) |
| **Platform-wide sender (SMTP2GO relay)**                  | One platform address and one shared quota, replacing the institution's own EmailJS account                                                                                                                 | One institution already has its own EmailJS                                                                              | Changes only `resolveEmailSettings()`; see `EMAIL_INTEGRATION_SPEC.md`            |
| **Renaming a slug**                                       | Changing a slug, with a redirect table so links already emailed keep working (§3, §15)                                                                                                                     | The slug is permanent by design                                                                                          | A real need to rename an institution's link                                       |
| **Terms acceptance record at first sign-in**              | A required tick-box and `termsVersion` on the account                                                                                                                                                      | Separate legal-documents work                                                                                            | `EMAIL_INTEGRATION_SPEC.md` §12.3                                                 |
| **One-time date-of-birth fix-up screen**                  | A page listing students with no date of birth, with an inline date field per row, to fix legacy students in one place (§5.4)                                                                               | Editing a student or re-importing already works, and the badge and filter find them                                      | Many legacy students stay flagged                                                 |
| **Automatic circuit breaker**                             | While `process-password-requests.mjs --watch` runs, count requests created in the last hour and, past `REQUESTS_PER_HOUR`, set `forgotPasswordOpen: false` for that institution and print a warning (§8.1) | It only works while the owner's machine is running the script; the daily routine and the in-app counter cover it for now | The first real spike, or a second institution going live                          |
| **Request status for the person** | A way for a signed-out person to see whether their request was approved, rejected or expired (§6.4) | They have no account session; the neutral message says the administrator will be in touch | Admins are asked "what happened to my request?" often |
| **Reconcile the two request queues** | If the platform-sender spec is ever built, merge `credential_requests` (that spec) and `password_requests` (this one) into one queue | Only this spec is being built | The platform-sender spec is scheduled |
