# Email Integration — Welcome Email on Behalf of an Institution

> **Status:** Planned — not yet implemented (spec written before code, per this repo's standing convention). Written 2026-10-03 on branch `email-feat-investigation` after a design review. **A spike is required before any code** (§12): three assumptions about EmailJS and SMTP2GO are unverified. Scope trimmed on 2026-10-03: the follow-up **confirmation email** (after the first password change) is **deferred**, not built in this feature (§7); SMTP2GO stays in the design.
> **Feature:** The app emails users on behalf of their institution: a **welcome email** to a person whose account still has `mustChangePassword: true`, carrying a link to the live site (institution preselected on the login page), the default password and sign-in instructions. The "From" name and address are the user's institution's name and email address. Sending is opt-in per send, quota-aware and blocked until the institution's sender is verified.
> **Route:** One existing route changes: `/login` accepts `?institution=<id>`. Files (new): `src/lib/email/` (payload builders, `sendEmail()`, quota guard, config), an "Email settings" card for institutions, a quota meter and a "Send credentials" action on the user lists. Files (edited): `src/scenes/(auth)/login/index.tsx`, `src/components/forms/AdminCreateUserForm.tsx`, `src/scenes/(dashboard)/import/index.tsx`, `firestore.rules`, `src/lib/firebase.ts`, `.env` files.
> **Roles:** Sending — `institution_admin` (own institution) and `super_admin`. Verifying a sender and the platform kill switch — `super_admin` only. Receiving — any account with an email address. Not available to teachers, students or parents.
> **Resolves:** `DEV_NOTES_ANALYSIS.md` item 21 (registration approval and account creation should email the person their credentials; decision: client-side EmailJS, no Cloud Functions). Does **not** build self-service Forgot Password (see §11).

---

## 1. Overview

Accounts are created by admins with a role default password and `mustChangePassword: true`. Today the admin has to pass the address, password and instructions to each person by hand, and the person has to pick their institution from a dropdown before they can sign in. This feature sends that information by email, from the institution.

Constraints that shape every decision: Firebase **Spark** (no Cloud Functions), a free email plan, no paid backend, and a **commercial** product (so Vercel Hobby, which is non-commercial only, cannot host a server function).

### 1.1 What the user decided

| Question | Decision |
| --- | --- |
| Provider and host | **Client-only, EmailJS** (consistent with item 21). No serverless function. |
| Welcome email content | Login link (institution preselected), **default password**, sign-in instructions. |
| When it is sent | **Opt-in per send**: a "Send credentials" action and a tick-box when creating accounts. Volume expectation: under about 100 accounts a month. |
| "From" identity | Per institution: address = the institution's email, name = the institution's name. |
| Institution addresses | A mix of own-domain and Gmail/Yahoo/Outlook addresses. |
| Unverified sender | **Block sending** until the institution's sender is verified. |
| Confirmation email after the first password change | **Deferred**: not built in this feature (§7). |
| Forgot Password | **Admin-only resets** (no self-service); see §11. |

---

## 2. Background / Investigation Findings

- **Prior decision.** `internal/in-regards-to-dev-notes/DEV_NOTES_ANALYSIS.md` item 21 already chose "a client-side call to a third-party transactional email API with its own free tier (EmailJS, 200/month), triggered from the admin's browser; known trade-offs: an exposed key (mitigated by a domain allowlist) and the provider's own cap". It also states: one self-service password change, then admin-request-only.
- **Accounts are created in three places**, all with `mustChangePassword: true`: `AdminCreateUserForm.tsx` (single; also used by Registrations "Convert to accounts", up to three accounts per registration), the bulk student import (`import/index.tsx`, a loop over every row with `SHARED_STUDENT_IMPORT_PASSWORD`), and seed scripts. Role defaults are in `ROLE_DEFAULT_PASSWORDS`.
- **First password change** is `change-password/index.tsx`: `reauthenticateWithCredential` → `updatePassword` → `updateDoc({ mustChangePassword: false })`. The users rule lets an owner only *clear* that flag. Nothing in this feature changes it; it is the hook point a deferred confirmation email would use (§7).
- **Login** (`login/index.tsx`) has no URL parameters. It starts on a "choice" view, then the form; the Institution `<select>` is filled from `fetchAllInstitutions()` (the public `registration_directory`, `allow read: if true`). "Forgot password?" is an inert `<span>`; after three failures a hint says "Contact your administrator". `docs/login/LOGIN_ARCHITECTURE.md` documents "no self-service password reset".
- **Institution email exists.** `InstitutionDocument.email?` (optional, from the Institution Profile wizard). There is no email configuration.
- **No backend exists.** `vercel.json` is only a catch-all rewrite and there is no `api/` folder; `firebase-admin` is a dev dependency used by scripts only.
- **Guards to respect.** `DATA_MODE` (live/mock/blank), the one-active-session lock and tab-scoped sign-in (a link opens a signed-out tab, which is fine), and `audit_log` event types mirrored in `firestore.rules` and guarded by `auditRules.test.ts`.

### 2.1 Services compared (web research; confirm before building)

| | EmailJS free | SMTP2GO free | Firebase Auth reset email |
| --- | --- | --- | --- |
| Volume | 200 requests/month, 2 templates, 50 KB, 7-day history, **1 connected email service** | 1,000/month, 200/day, 25/hour until the sender domain is verified | 150 emails/day, 1,500 links/day (Spark) |
| Key model | Public key is browser-safe (domain allowlist, optional reCAPTCHA); a private key must stay server-side | Secret API key only, so it needs a server | Built in |
| "From" | A Gmail/Outlook service always sends as that one mailbox; an SMTP service can send via any relay | Verified sender address or domain | The Firebase project address (name/subject/Reply-To set project-wide) |
| Limit enforcement | Client-side only (bypassable); the provider cap is the real stop | Server-side, if a function exists | n/a |

**Judgement.** SMTP2GO behind a server function is the strongest architecture, but the platform is commercial (Vercel Hobby is out) and the user chose client-only. The workable client-only design is **EmailJS with its single connected service set to custom SMTP, pointing at the SMTP2GO relay**: the SMTP2GO credentials then live in EmailJS (never in the browser), and the per-institution From name, address and Reply-To are passed as template parameters. This is unproven; see the spike (§12). If the spike fails, the fallback is a single platform sender with the institution's name and Reply-To.

---

## 3. Design Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Provider path | EmailJS (client) → custom SMTP service → SMTP2GO relay | Meets "client-only, free" and keeps the relay credentials out of the browser. Needs the spike. |
| Send behind one wrapper | `sendEmail()` in `src/lib/email/`; nothing else imports EmailJS | The provider can be swapped (for example to a server function) without touching callers. |
| One EmailJS template | A generic template: `subject`, `html_body`, `to_email`, `to_name`, `from_name`, `from_email`, `reply_to` | The free plan allows two templates; one generic template serves every email type. |
| Trigger | Opt-in per send | Protects the 200/month cap; imports and onboardings never auto-send. |
| Password in the email | The role default (or the admin-chosen password) | The user's choice; mitigated by the forced first change. The provider keeps request history for 7 days. |
| Login link | `<VITE_APP_URL>/login?institution=<id>` | A fixed canonical URL; `window.location.origin` would mail localhost or preview links. No PII in the URL. |
| Sender verification | `institutions/{id}.emailSettings.senderVerified`, set by `super_admin` | EmailJS has no verification API; the platform owner verifies each address at the relay and flips the flag. Sending is disabled until then. |
| Quota | Reserve-then-send counters, per period and per institution, plus a kill switch | The cap is shared by every institution; client-side logic is best-effort (§8). |
| Never send in dev/QA | Gated on `VITE_EMAIL_ENABLED` and `DATA_MODE === 'live'` | QA specs create real `@demo.com` accounts. |
| Confirmation email | Deferred (§7) | Not needed for the first release; keeps volume to one email per account. |

---

## 4. Data Model

```ts
// institutions/{id}.emailSettings (new, optional)
type EmailSettings = {
  enabled: boolean;          // the institution has turned sending on
  fromName: string;          // defaults to institution.name
  fromEmail: string;         // defaults to institution.email (must be a valid address)
  senderVerified: boolean;   // set by super_admin after verifying the address at the relay
  senderVerifiedAt?: Timestamp;
};

// users/{uid} (new, optional fields; admin-written)
credentialsEmailedAt?: Timestamp;   // last welcome email
credentialsEmailCount?: number;     // for the resend cap

// email_usage/{periodId}  (new; periodId = provider billing period, e.g. "2026-10-14")
type EmailUsage = {
  total: number;                      // requests in the period
  byInstitution: Record<string, number>;
  updatedAt: Timestamp;
};

// platform_config/email (new, one document)
type EmailPlatformConfig = {
  enabled: boolean;                   // kill switch
  monthlyLimit: number;               // 200 on the free plan
  reserveForSecurity: number;         // held back from the cap
  periodStartDay: number;             // provider billing day of month
  perInstitutionCap?: number;
};
```

No type change to `AuditEventType` is required unless sends are audited (§10).

---

## 5. Welcome email

**Content (HTML, plain-language, institution-branded).** Greeting with the person's name; "<Institution> has created an account for you."; a button/hyperlink **Go to the sign-in page** (`/login?institution=<id>`); the **email address to sign in with** (their own, the one the message was sent to); the **temporary password**; steps: open the link, confirm the institution shown, type your email and the temporary password, then choose a new password when asked; a note that the password is temporary and the link only works for this institution; Reply-To = the institution's email.

**Where it is sent from**

- A **Send credentials** action on each Students/Teachers/Parents row for an account with `mustChangePassword: true` (hidden otherwise), with a confirm that shows the remaining quota.
- An opt-in tick-box **Email the credentials to this person** on `AdminCreateUserForm` and on Registrations "Convert to accounts".
- An opt-in section on the import's commit step: **Email credentials to N students** with the quota meter and a hard stop at the cap. Sent after all rows are created, throttled (§8).

**Rules.** Only when `emailSettings.enabled && senderVerified`, the platform kill switch is on, the quota allows it, and the recipient's cooldown has passed. Best-effort: a failure never undoes account creation; the admin sees a clear message and can fall back to sharing the password by hand.

---

## 6. Login deep link

`LoginPage` reads `?institution=<id>`:

- Present: skip the "choice" view and show the form; `LoginFormView` preselects that institution once `fetchAllInstitutions()` resolves (no extra read, the directory is already fetched).
- Unknown id: ignore it (show the normal dropdown). The existing post-login institution gate still applies, so a wrong id can never sign someone into the wrong institution.
- The link carries no email or password.

---

## 7. Deferred: confirmation email

Scrapped for now (2026-10-03); it may be added later. The idea was a follow-up email, "You have signed in and changed your password", sent after the user's first successful password change.

If it returns, it slots in without new infrastructure:

- **Hook point.** `src/scenes/(auth)/change-password/index.tsx`, after `updatePassword` and the `mustChangePassword: false` write both succeed (`navigate("/dashboard")` must not wait for it).
- **Same machinery.** The same `sendEmail()` wrapper, institution sender, kill switch and quota guard (§8), so it counts against the same cap: it would take the cost to two emails per new account.
- **Once only.** A `passwordChangedEmailedAt` field on the user document would guard against duplicates; the owner would need to be allowed to write it alongside the existing `mustChangePassword` clear (keeping the `passwordFlagOk` check intact in `firestore.rules`).
- **Best-effort.** If sending is disabled or the sender is unverified, nothing is sent and nothing is shown.

---

## 8. Limits and abuse protection

Two budgets apply: **EmailJS 200 requests/month** (shared by every institution; counted from the account's billing day, not the calendar month) and the SMTP2GO relay's own caps.

**Enforcement logic (all client-side, so best-effort):**

1. **Reserve-then-send.** Increment `email_usage/{period}` (Firestore transaction or `increment()`) *before* calling EmailJS; roll back on a clear failure; count ambiguous failures anyway.
2. **Thresholds.** Warn the admin at 80% of `monthlyLimit`; hard-stop at `monthlyLimit − reserveForSecurity`.
3. **Per-institution cap** (`perInstitutionCap`, or a fair share) so one school cannot exhaust everyone's quota.
4. **Per-recipient cooldown and cap.** No resend within 24 hours; at most 3 welcome emails per account.
5. **Throttle** to one send per second in bulk, one retry, then stop and report.
6. **Quota meter** in the UI ("37 of 200 this month") with the manual flow as the fallback at the cap.
7. **Kill switch** (`platform_config/email.enabled`), read once per session and cached, so the platform owner can stop all sending without a redeploy.
8. **Period reset** on the provider's billing day (`periodStartDay`).

**What the client cannot stop.** The EmailJS public key and service id are visible in the bundle; anyone can call the API with a spoofed Origin and burn the 200 (an email denial of service). Mitigations in the EmailJS dashboard: restrict allowed domains, leave "non-browser applications" off, consider reCAPTCHA. The provider's monthly cap is the real stop; the counters above only constrain honest use. This is the main cost of staying client-only.

---

## 9. Firestore rules and free-tier impact

**Rules (`firestore.rules`):**

- `institutions/{id}.emailSettings`: `institution_admin` may change `enabled` and `fromName` for their own institution; only `super_admin` may change `fromEmail` and `senderVerified`.
- `email_usage/{period}`: `institution_admin`/`super_admin` may read; writes only as +1 increments of `total` and their own institution's counter (shape- and size-checked). Teachers, students and parents: none.
- `platform_config/email`: readable by admins; writable by `super_admin` only.
- `users/{uid}`: `credentialsEmailedAt` and `credentialsEmailCount` writable by admins in their institution only. The owner-edit allow-list and the `passwordFlagOk` check are unchanged.

**Free-tier cost.** Per email: one counter write and one `credentialsEmailedAt` write; one cached read of `emailSettings` and one of `platform_config/email` per session. At under about 100 accounts a month this is a few hundred writes against Spark's 20,000 a day. No Cloud Functions, no listeners, no Blaze-only features.

---

## 10. Audit (optional, decide at implementation)

A `credentials_emailed` entry in `audit_log` would record who emailed whom and when (never the password). If added, mirror the new `AuditEventType` in `firestore.rules` and `auditRules.test.ts` (the drift test fails otherwise), and add its label in `auditEvents.ts`.

---

## 11. Deferred: Forgot Password and Request Password Change

- **Forgot Password.** The decision is **admin-only resets**, matching item 21 ("one self-service change, then admin-request-only") and `LOGIN_ARCHITECTURE.md`. The inert "Forgot password?" text becomes a **request**: the user enters their email and institution, and the institution's admin is notified (in-app, optionally by email through the same wrapper). The admin resets the password with the existing script (`ROLE_DEFAULT_PASSWORD_RESET_SCRIPT_SPEC.md`), then uses **Send credentials**. A browser cannot set another user's Auth password, and a self-service link would need either Firebase's own reset email (sent from the Firebase project address, not the institution) or a trusted server.
- **Request Password Change** (not yet existing, on the User Profile page). Same shape: a request that notifies the institution's admin. Not designed here.
- Both reuse `sendEmail()` and the quota rules, so they need no new infrastructure. Their wording, flows and any new `AuditEventType` get their own spec.

---

## 12. Spike (do this first)

Before any production code, with a throwaway EmailJS account and a free SMTP2GO account, confirm:

1. **EmailJS accepts a dynamic From on a custom SMTP service** (template From name/email taken from parameters), and Reply-To works.
2. **SMTP2GO free allows several verified sender addresses** (how many?) and what verifying an address involves for an institution (a link emailed to that mailbox, or domain DNS records).
3. **Gmail/Yahoo/Outlook addresses as the From** (via the relay): whether SMTP2GO accepts them, and whether messages land in the inbox or spam. Expect DMARC failure; the fallback is a platform sender with the institution's name and Reply-To.
4. **EmailJS free allows a custom SMTP service as its one connected service** and what its API does when the monthly cap is hit.
5. The security settings: domain allowlist, "non-browser" off, a request from an unlisted origin is refused.

**Outcome rules.** If 1 and 2 pass, build as specified. If 3 fails for webmail addresses, institutions without their own domain use the fallback sender (the `senderVerified` rule then means "verified at the relay, or fallback accepted"). If 1 fails, use a single platform sender with the institution's name and Reply-To and drop per-institution addresses.

---

## 13. Testing Considerations

- Standing gate: `npx tsc -b`, `npx eslint .`, `npx vitest run`, `npm run build`.
- **Unit:** payload builders (the welcome HTML contains the institution name, the link `<VITE_APP_URL>/login?institution=<id>`, the password only where intended, no stray placeholders); the quota guard (reserve, thresholds, per-institution cap, per-recipient cooldown and cap, period reset, kill switch); the deep-link parser (known, unknown and missing ids).
- **Rules tests:** counter writes (+1 only, admins only), `emailSettings` field-level permissions, and that an owner cannot write `credentialsEmailedAt` or `credentialsEmailCount`.
- **Live e2e (new spec, next free number):** `/login?institution=<id>` opens the form with that institution selected; an unknown id shows the normal dropdown; creating an account with sending off (flag) sends nothing; with a stubbed `sendEmail` the welcome payload is built once. Never send real email from automated specs.
- **Manual (after the spike):** one real welcome email to a test mailbox for an own-domain institution and for a webmail one; check spam placement and the From name.

---

## 14. Implementation Order

1. **Spike (§12)** and record the results in this file's header.
2. Config and data: `EmailSettings` UI (institution admin: enabled and name; super_admin: address and verified), `platform_config/email`, rules and tests.
3. `src/lib/email/`: `sendEmail()` wrapper, payload builders, quota guard and counters, flags, with unit tests.
4. Login deep link (`?institution=`) and its e2e.
5. Welcome email: **Send credentials** action, then the tick-boxes on create and Convert, then the quota meter.
6. Import commit-step sending (bulk, throttled).
7. Docs (§15) and a PR; then, separately, the Forgot Password / Request Password Change request flows.

---

## 15. Documentation updates (part of this change)

- `docs/guides/USER_GUIDE.md`: a new section for institution admins (enable email, verify the sender, **Send credentials**, the quota meter and what happens at the cap), and a note for new users about the welcome email and the link.
- `docs/login/LOGIN_ARCHITECTURE.md`: the `?institution=` parameter and the unchanged institution gate.
- `docs/ISSUES_AND_GAPS.md`: a new entry for the limits in §8 (client-side enforcement, shared quota, password in the email and provider history, one connected EmailJS service).
- `internal/in-regards-to-dev-notes/DEV_NOTES_ANALYSIS.md` item 21: link to this spec.

---

## 16. Risks and limits (summary)

- **Shared, small quota:** 200 requests a month for every institution; one welcome email per new user is about 200 users a month (a 30-student import is 30 emails). Resends and any future confirmation email (§7) would eat into this.
- **Client-side enforcement is bypassable:** the public key can be used to exhaust the cap.
- **Password in the inbox and the provider's 7-day history,** valid only until the forced first change.
- **Per-institution From depends on the spike;** webmail senders are the weakest case.
- **Bounces still count,** and many students have no real or unique email address.
- **No self-service reset:** a user who forgets the password must ask their admin.
