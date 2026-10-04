# Email Integration — Welcome Email Sent on Behalf of an Institution

> **Status:** Planned — not yet implemented (spec written before code, per this repo's standing convention). Written 2026-10-03 on branch `email-feat-investigation`; revised after a review the same day, and again to add **Send credentials** and **Resend credentials**, which reset the account's password to the role default through a locally-run script before the email goes out (§5.3), and a third time after reading EmailJS's published Terms and Privacy Policy (§12). **The checks in §14.D and §14.E come before any code:** the EmailJS-to-SMTP2GO relay, the dynamic From name and Reply-To, a plain-text part, and EmailJS's and SMTP2GO's terms are unproven. The follow-up **confirmation email** is **deferred** (§7).
> **Feature:** The app emails users on behalf of their institution: a **welcome email** to a person whose account still has `mustChangePassword: true`, carrying a link to the live site (institution preselected on the login page), the temporary password and sign-in instructions. Accounts that have not completed their first password change can be sent their credentials later (**Send credentials** the first time, **Resend credentials** after that): an institution admin requests it, the platform owner approves it, a locally-run script resets the account's password to the role default, and only then is the email sent. Every message is sent **from one platform sender address** (on a verified sub-domain the owner controls) with **From name = "{Institution name} via {App name}"** and **Reply-To = the institution's reply address**, and its text says plainly that the app only delivers the message on the institution's behalf. Sending is opt-in per send, capped per institution and quota-aware.
> **Route:** One existing route changes: `/login` accepts `?institution=<id>`. Files (new): `src/lib/email/` (`resolveSender()`, payload builders including the messenger notice, `sendEmail()`, quota guard, config), an "Email settings" card (super_admin), a quota meter, an "Email the credentials" tick-box at account creation, per-row **Send credentials** and **Resend credentials** buttons on the lists, a super_admin **Credential requests** inbox, and a local script `scripts/process-credential-requests.mjs`. Files (edited): `src/scenes/(auth)/login/index.tsx`, `src/components/forms/AdminCreateUserForm.tsx`, `src/scenes/(dashboard)/import/index.tsx`, the Students, Teachers and Parents list pages, `firestore.rules`, `firestore.indexes.json`, `src/lib/firebase.ts`, `.env.example`.
> **Roles:** Creation-time sending — `institution_admin` (own institution) and `super_admin`. Send and Resend credentials — an `institution_admin` **requests** them for their own institution's accounts; the `super_admin` **approves** or rejects, runs the reset script and sends the email (§5.3). Reply-To address, per-institution cap, the platform settings and the kill switch — `super_admin` only; an `institution_admin` may only pause or resume their own institution's sending. Receiving — any account with an email address. Not available to teachers, students or parents.
> **Resolves:** `DEV_NOTES_ANALYSIS.md` item 21 (registration approval and account creation should email the person their credentials; decision: client-side EmailJS, no Cloud Functions). Does **not** build self-service Forgot Password (see §11).

---

## 1. Overview

Accounts are created by admins with a role default password and `mustChangePassword: true`. Today the admin has to pass the address, password and instructions to each person by hand, and the person has to pick their institution from a dropdown before they can sign in. This feature sends that information by email, in the institution's name, through the platform.

Constraints that shape every decision: Firebase **Spark** (no Cloud Functions), free email plans, no paid backend, and a **commercial** product (so Vercel Hobby, which is non-commercial only, cannot host a server function). The platform does not, and will not, control any institution's Gmail, Yahoo, business or school mailbox, so it never sends *from* one.

### 1.1 What the user decided

| Question | Decision |
| --- | --- |
| **Sender address** | The **app's own domain**: one platform address on a verified sub-domain. Accepted in exchange for **no per-institution EmailJS account** and a **messenger statement** in every message saying the app only delivers the message for the institution. |
| From name | **"{Institution name} via {App name}"**. |
| Reply-To | A `replyTo` that defaults to the institution's email and can be changed by **`super_admin` only**. |
| Provider and host | **Client-only**: one platform **EmailJS** account whose single service is **custom SMTP to the SMTP2GO relay**. No serverless function for now (§15 names the trigger to add one). |
| Setup | Once, by the platform owner. Per institution, `super_admin` sets `replyTo` and a monthly cap and creates the settings; the institution's admin can pause and resume its own sending. Institutions touch no email provider. |
| Quota | One shared EmailJS cap (200/month on free) split by a **per-institution monthly cap**. |
| Welcome email content | Login link (institution preselected), **temporary password**, sign-in instructions, and the messenger statement (§5). |
| Credentials actions | Two **separate** per-row actions on the Students, Teachers and Parents lists, gated by `mustChangePassword` and by whether the person has ever been emailed (state table, §5.3). An action that is not selectable is shown disabled with a reason. |
| Password rule | Creation-time tick-boxes email the password typed in the form. **Send** and **Resend** first **reset the account's real password to the role default**, then email it, so the default is the only correct password when the email arrives. |
| Who does what | An `institution_admin` **requests**; the `super_admin` **approves** or rejects; a locally-run Admin SDK **script** resets the password; the `super_admin`'s browser then sends the email automatically while its page is open. No hosted server function (§5.3). |
| Caps | At most **12** credential emails per account for life (the first Send and every Resend count), and one every **24 hours**. |
| Recipient | A student **under the guardian-age threshold (default 16, a platform setting)** has credentials emailed to a **linked guardian**, never to the child's own address; older students, parents and staff to their own address. No guardian with an email means sending is blocked with a reason (§5.3). |
| Consent record | A pre-login **Disclaimer** pop-up gives notice to every visitor, and a **per-account acceptance** (version and time) is recorded at first sign-in, with re-acceptance when the version changes (§12.3). |
| When it is sent | **Opt-in per send.** Volume expectation: under about 100 accounts a month. |
| Incomplete or broken setup | **Block sending**; the admin shares the password by hand, as today. |
| Abuse risk of a public key | **Accepted for now**, with a stated trigger to move sending behind a free server function (§15). |
| Confirmation email after the first password change | **Deferred** (§7). |
| Forgot Password | **Admin-only resets** (no self-service); see §11. |

---

## 2. Background / Investigation Findings

- **Prior decision.** `internal/in-regards-to-dev-notes/DEV_NOTES_ANALYSIS.md` item 21 already chose "a client-side call to a third-party transactional email API with its own free tier (EmailJS, 200/month), triggered from the admin's browser; known trade-offs: an exposed key (mitigated by a domain allowlist) and the provider's own cap". It also states: one self-service password change, then admin-request-only.
- **Accounts are created in three places**, all with `mustChangePassword: true`: `AdminCreateUserForm.tsx` (single; the password field is pre-filled with the role default but editable; also used by Registrations "Convert to accounts", up to three accounts per registration), the bulk student import (`import/index.tsx`, a loop over every row with `SHARED_STUDENT_IMPORT_PASSWORD`), and seed scripts. Role defaults are in `ROLE_DEFAULT_PASSWORDS` (student, parent, teachers); `institution_admin` and `super_admin` have **no default**. The one-off reset script (`ROLE_DEFAULT_PASSWORD_RESET_SCRIPT_SPEC.md`) also sets accounts back to the role default.
- **The password is only known at creation.** Nothing stores a custom password, so the app cannot email a custom password afterwards. To make an emailed password correct, Send and Resend reset the account to the role default first (§5.3).
- **A browser cannot reset another user's password.** The client SDK only changes the signed-in user's own password; setting someone else's needs the Admin SDK. Spark has no Cloud Functions and the decision is no hosted server function, so the reset is done by a **locally-run script** on the platform owner's machine, triggered from the app through a **request queue** in Firestore (§5.3). The existing `scripts/reset-role-default-passwords.mjs` already performs the same reset (role default, `mustChangePassword: true`, refresh tokens revoked, a `password_reset` audit entry); the new script follows it.
- **First password change** is `change-password/index.tsx`: `reauthenticateWithCredential` → `updatePassword` → `updateDoc({ mustChangePassword: false })`. The users rule lets an owner only *clear* that flag. Nothing in this feature changes it; it is the hook point a deferred confirmation email would use (§7).
- **Login** (`login/index.tsx`) has no URL parameters. It starts on a "choice" view, then the form; the Institution `<select>` is filled from `fetchAllInstitutions()` (the public `registration_directory`, `allow read: if true`). "Forgot password?" is an inert `<span>`; after three failures a hint says "Contact your administrator". `docs/login/LOGIN_ARCHITECTURE.md` documents "no self-service password reset".
- **Institution data.** `InstitutionDocument.email?` (optional, from the Institution Profile wizard) and `name`, both free text typed by an institution admin, so both are untrusted input to an email (§5.2, §13).
- **The institutions update rule is broad.** `allow update: if isSuperAdmin() || (isAdmin() && myInstitutionId() == institutionId)` has no field restriction, so field-level control over email settings is not possible on that document. The settings therefore live in their **own document** (§4).
- **List rows are hand-built.** `useInstitutionUsers` returns full user documents, but each list page maps its own row type (the Students row has no `mustChangePassword`), the same pattern that once dropped `phone2` and `idNumber`. Rows must be extended for the actions in §5.3.
- **No backend exists.** `vercel.json` is only a catch-all rewrite and there is no `api/` folder; `firebase-admin` is a dev dependency used by scripts only. `@emailjs/browser` is not a dependency.
- **Guards to respect.** `DATA_MODE` (live/mock/blank), the one-active-session lock and tab-scoped sign-in (a link opens a signed-out tab, which is fine), and `audit_log` event types mirrored in `firestore.rules` and guarded by `auditRules.test.ts`.

### 2.1 Free-plan limits (web research; verify the numbers marked on the providers' own pages before relying on them)

**EmailJS free plan** (pricing page, API docs, search results)

| Limit | Free plan |
| --- | --- |
| Emails ("requests") per month | **200**, for the whole platform (one account); counted per billing period; at 100% further requests are **dropped** (no overage billing) |
| Email templates | **2** (one is used; one spare) |
| Connected email services | **1** (verify on the dashboard) |
| Request size | **50 KB** |
| Attachments | **Not included** (500 KB on Personal, 2 MB on Professional) |
| Contacts | **500** |
| Data (history) retention | Pricing page: **7 days**; Privacy Policy: active accounts keep data **30 days** (treat as up to 30). The request history includes template values, so the temporary password, unless **activity logging is switched off** in the template's Settings tab; request **metadata** (the Events page) is kept regardless |
| Seats | **1** |
| API rate limit | **1 request per second** (`POST https://api.emailjs.com/api/v1.0/email/send`) |
| Dynamic fields | Template fields (To, From Name, Reply-To, Subject, content) accept variables; the From address comes from the connected service |
| Key model | Public key, service id and template id are browser-safe; a private access token must stay server-side; allowed-domain list and optional reCAPTCHA |
| **Terms** (Terms and Conditions, 2026-09-28) | Run by EmailJS Pte. Ltd. (Singapore); Singapore law and courts, disputes on an individual basis only. Account holders must be **16 or older**; accounts made by bots are prohibited. **"Each user is solely responsible for all of his, her, or their messages sent through the Service."** Spam (irrelevant or unsolicited messages, typically in volume, for advertising, phishing or malware) and bulk or mailing-list email to people who have not specifically agreed are prohibited. **Multiple free accounts are "not considered acceptable use"** (for example many free accounts created by one organisation). Free accounts **inactive for over a year may be deleted** and their content erased. The service is **"as is"**: no warranty of reliability, no guarantee of data security, no liability for loss of data or profits or for a security failure; the SLA credits are a share of a paid plan's cost (nothing on free); the Company is not responsible for third-party claims arising from your use (indemnification); terms may change at any time |
| **Privacy Policy** (2026-09-08) | **Servers in the USA on AWS**; subprocessors Cloudflare, Amazon Web Services, Zendesk and Sentry (all US); data may be transferred to the US (Standard Contractual Clauses or the UK IDTA for European and UK users; a DPA is offered, covering GDPR, UK and Swiss law, not Jamaican law); disclosure only to competent Singapore authorities. EmailJS has **no direct relationship with the people we email ("Users-of-Users")**: the account holder is the **Controller** and is responsible for security, integrity, authorised use and consents and notices, and requests from recipients go to the account holder. EmailJS collects nothing from anyone under 13 and directs its service to people 16 or older (this is about its account holders, not our recipients) |
| Paid, for reference | Personal $9 (2,000/month, 6 templates), Professional $15 (5,000, unlimited templates, 3 seats), Business $40 (25,000) |

**SMTP2GO free plan** (developer docs, blog posts, search snippets of the `support.smtp2go.com` articles, which returned 403 to the research tool)

| Limit | Free plan |
| --- | --- |
| Emails per month | **1,000**; resets at the **start of the billing cycle**; at 100% emails are **rejected, not queued**, and **rejected sends still count** |
| Emails per day | **200** (excess is queued) |
| Emails per hour | **25 until a sender domain is verified**, lifted automatically afterwards |
| Verified senders | **5** in total, sender domains and single senders combined (verify); this design uses **one** (the sending sub-domain) |
| Sender rules | Every From must be a verified sender (required since 2025-04-11), otherwise rejected ("550 From header sender domain not verified"); Gmail and Yahoo addresses cannot be verified; a single sender is not SPF/DKIM-aligned, a verified domain is |
| SMTP users | **No limit** on how many; optional per-user rate (speed) limit, "Restrict Senders" and an unsubscribe footer (keep it **off**) |
| Connections and session | **40** concurrent connections, **5,000** emails per SMTP session; default speed up to 200,000/hour (irrelevant on free) |
| Recipients and size | **400** recipients per SMTP message (100 per To/CC/BCC field on the API); **50 MB** per message |
| Templates | **API only**, not the SMTP relay |
| Webhooks | **1** on free; needs a server endpoint |
| Activity/reporting history | **5 days** |
| Email archiving | Paid plans only |
| Support | Phone and live chat limited to the first **14 days** |
| Accounts | A business must not create more than **10** free accounts |
| New-account review | New accounts are reviewed; initial quota **1,000**, excess held until reviewed (verify) |
| Terms | Free plan is "primarily for trial purposes and for sending low amounts of email"; recipients must have a legitimate relationship; no sending from addresses you have no permission to use; you must control the content; immediate suspension for violations; bounce rate 0-8% rated good, over 12% poor; the unsubscribe-link rule is for mailing lists, not for one-to-one transactional mail like this |
| Notifications | Email to team members at 80%, 90% and 100% of the monthly allowance |
| Relay connection | `mail.smtp2go.com` (regional hosts: US, EU, AU); STARTTLS on 587, 2525, 8025, 25, 80; SSL on 465, 8465, 443; authenticated by an SMTP user and password |

### 2.2 Judgement on the sender model

**Sending from the app's own domain, with the institution named and replies routed to it, is feasible and is the pattern SMTP2GO itself recommends for platforms.**

1. **No per-institution EmailJS account.** One platform EmailJS account with one service and one generic template serves every institution. From Name and Reply-To are template fields that accept variables, so each message carries `from_name` and `reply_to` for its institution; the From address is fixed by the platform's service. An institution's address type (Gmail, Yahoo, school, business) does not matter because Reply-To needs no verification.
2. **A clear "messenger" statement.** The message is generated by the app, so a header line and footer saying the app only delivers it for the institution, and that replies go to the institution, are mandatory and unit-tested (§5.1).
3. **Deliverability.** A verified sending sub-domain gives aligned SPF and DKIM; nothing depends on an institution's own DMARC policy. Only one of the five free verified-sender slots is used.
4. **Costs.**
   - **One shared quota:** EmailJS's **200 requests a month cover the whole platform**, so a per-institution cap is essential (§8). SMTP2GO's 1,000 a month only becomes reachable after an EmailJS upgrade (Personal, about $9, 2,000 a month).
   - **One shared sender reputation:** one institution's bounces or complaints affect every institution.
   - **Identity perception:** an institution's name appears on mail from another domain. The "via {App}" name and the messenger statement are the mitigation; the app, not the institution, is the sender of record.
   - **Abuse surface:** the From name and Reply-To derive from institution-controlled text (§13), so Reply-To is locked to `super_admin` and both are sanitised.
5. **SMTP2GO is what makes it possible without a mailbox** (§2.3); EmailJS remains the browser-side bridge.

### 2.3 Transport options for the platform sender (a platform-level choice, never per institution)

| | **A. SMTP2GO relay behind EmailJS (chosen)** | B. EmailJS service on a mailbox at the app's domain (alternative) |
| --- | --- | --- |
| From address | `no-reply@{verified sub-domain}`; no mailbox needed | The mailbox's own address |
| What is needed | An SMTP2GO account, a verified sub-domain, one SMTP user, EmailJS custom SMTP pointing at the relay | A mailbox at the domain (Google Workspace, Microsoft 365 or hosted) with Gmail/Outlook OAuth or SMTP access |
| Deliverability | SPF and DKIM aligned through the verified sub-domain | Depends on that mailbox provider's SPF/DKIM |
| Caps | EmailJS 200/month (binding), then SMTP2GO 1,000/month, 200/day | EmailJS 200/month, plus the mailbox's own daily cap |
| Cost | Free (the owned domain is the only cost) | Usually a paid or hosted mailbox |
| Moving parts | Two providers | One provider |

Option A is chosen because it needs no mailbox and gives aligned authentication. Option B stays a valid fallback if SMTP2GO's review or terms ever block the platform; only the EmailJS service changes (no app change).

**One free EmailJS account only.** EmailJS's terms call multiple free accounts unacceptable use, so growth means upgrading the one account (Personal, 2,000 a month), moving sending behind a server function (§15), or changing transport, never opening more free accounts. That also rules out a per-institution EmailJS account as a fallback.

---

## 3. Design Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Sender | `resolveSender()` returns `{ fromName: "{institution.name} via {appName}", fromEmail: platform.senderAddress, replyTo }` or a block reason | One verified platform sender for everyone; identity carried by the name, Reply-To and the body. |
| Provider path | EmailJS (browser) → one custom SMTP service → SMTP2GO relay | Meets "client-only, free"; SMTP credentials live only in EmailJS. |
| Messenger statement | Mandatory header line and footer in every message, built by the payload builder and covered by unit tests; the EmailJS template also carries a **static** footer line with no variables | The agreed condition for the platform-domain From address. A static template line cannot be changed by a forged request. |
| From name | `"{institution.name} via {appName}"`, sanitised and truncated | Institution is named; the app is visible in the inbox list. |
| Reply-To | `replyTo` from the institution's email settings (defaults to `institution.email`), `super_admin` only | Replies reach the institution; replies cannot be redirected by an institution admin. |
| Settings home | `institutions/{id}/email_settings/config` (own document and rules) | The shared institutions update rule has no field restriction; a separate document keeps field-level control and leaves that rule alone. |
| Per-institution cap | `monthlyCap`, set by `super_admin` (default `defaultInstitutionCap`) | The 200/month is shared by everyone (§8). |
| One generic EmailJS template | `subject`, `html_body`, `to_email`, `to_name`, `from_name`, `reply_to` plus a static footer; From address fixed by the service | The free plan allows two templates; one serves every email type. |
| Send behind one wrapper | `sendEmail()` in `src/lib/email/` using a plain `fetch` to EmailJS's REST endpoint; nothing else knows EmailJS | No new dependency and exact control over status codes; the provider can be swapped (for example to a server function) without touching callers. The official `@emailjs/browser` SDK is an acceptable alternative. |
| Trigger | Opt-in per send | Protects the shared 200 a month; imports never auto-send. |
| Password in the email | At creation: the typed password. Send and Resend: the role default, after the account has been reset to it | The emailed password is always the correct one; mitigated by the forced first change and by switching EmailJS request logging off (otherwise its history keeps the value for up to 30 days). |
| Reset mechanism | A request queue (`credential_requests`) processed by a locally-run Admin SDK script; no hosted server | A browser cannot reset another user's password and Spark has no Cloud Functions; the owner's machine holds the service-account key. |
| Order | Reset first, then email | If the email then fails the account sits at the known role default (retry or share by hand); the reverse order could email a password that does not work. |
| Approval | `institution_admin` requests, `super_admin` approves | The reset is a platform-owner capability; institution admins cannot reset passwords. |
| Caps | 12 credential emails per account for life; 24 hours between sends | Bounds quota use and abuse; the first Send and every Resend count; the cap is never reset. |
| Login link | `<VITE_APP_URL>/login?institution=<id>` | A fixed canonical URL; `window.location.origin` would mail localhost or preview links. No PII in the URL. |
| Never send in dev/QA | Gated on `VITE_EMAIL_ENABLED` and `DATA_MODE === 'live'` | QA specs create real `@demo.com` accounts. |
| Who may enable an institution | `institution_admin` may switch `enabled` for their own institution; `super_admin` creates the settings and may change everything | An institution can pause its own sending; the abuse-sensitive fields stay with the platform owner. |
| Confirmation email | Deferred (§7) | Not needed for the first release. |

---

## 4. Data Model

```ts
// platform_config/email (new, one document; super_admin writes, admins read)
type EmailPlatformConfig = {
  enabled: boolean;                  // kill switch
  senderAddress: string;             // e.g. no-reply@mail.{your-domain}; an address on the verified sub-domain
  senderVerified: boolean;           // the sending sub-domain is verified at SMTP2GO; set by super_admin
  appName: string;                   // the single source for the From name and the messenger statement
  emailjs: { publicKey: string; serviceId: string; templateId: string };  // not secrets, but visible to every admin's browser and network traffic
  monthlyLimit: number;              // 200 (EmailJS free); the binding cap for the platform
  periodStartDay: number;            // the EmailJS billing day of month (1-31; clamped to the month's last day)
  defaultInstitutionCap: number;     // used when an institution has no monthlyCap (for example 50)
  guardianAgeThreshold: number;      // students younger than this get credentials emailed to a linked guardian (default 16; §5.3)
};

// platform_config/legal (new, one document; super_admin writes, every signed-in user reads)
type LegalConfig = { currentTermsVersion: string };  // bump to require re-acceptance (§12.3)

// institutions/{id}/email_settings/config (new, one document per institution)
type EmailSettings = {
  enabled: boolean;                  // institution_admin or super_admin
  replyTo?: string;                  // valid address; super_admin only; when absent, institution.email is used
  monthlyCap?: number;               // this institution's share of the platform limit; super_admin only
};

// users/{uid} (new, optional fields; admin-written)
credentialsEmailedAt?: Timestamp;    // last credentials email; its presence means "has been emailed before"
credentialsEmailCount?: number;      // credential emails sent to this account; lifetime cap 12; the first Send and every Resend count
emailInvalid?: boolean;              // an admin marked this address as bouncing or unusable (§8.5)
termsVersion?: string;               // the Terms and Privacy Policy version this person accepted at first sign-in (§12.3)
termsAcceptedAt?: Timestamp;         // when (server time); written by the person, not an admin

// email_usage/{periodId}  (new; periodId = the period's start date, UTC, "YYYY-MM-DD")
type EmailUsage = {
  total: number;                     // requests reserved in the period (all institutions)
  byInstitution: Record<string, number>;
  consecutiveFailures: number;       // reset to 0 on a success; sending blocks at 3 (§8.3)
  lastError?: string;                // short text for the Email settings card
  updatedAt: Timestamp;
};

// credential_requests/{requestId}  (new, top-level; ids, names and status only, never a password)
type CredentialRequest = {
  institutionId: string;
  targetUid: string;
  targetName: string;                // shown in the inbox
  targetRole: Role;                  // a role that has a default password
  type: 'send' | 'resend';
  status: 'requested' | 'approved' | 'rejected' | 'cancelled' | 'skipped'
        | 'reset_done' | 'reset_failed' | 'sent' | 'send_failed';
  requestedBy: string; requestedByName: string; requestedAt: Timestamp;
  approvedBy?: string; approvedAt?: Timestamp;
  resetAt?: Timestamp;               // set by the script
  sentAt?: Timestamp;                // set when the email is confirmed sent
  reason?: string;                   // short text: why rejected, skipped or failed
};

// platform_config/credential_script  (new; written only by the script)
type CredentialScriptStatus = {
  lastRunAt: Timestamp; lastRunMode: 'batch' | 'watch'; processed: number; failed: number;
};

// Pure function in src/lib/email/resolveSender.ts
type SenderResult =
  | { ok: true; fromName: string; fromEmail: string; replyTo: string;
      emailjs: { publicKey: string; serviceId: string; templateId: string } }
  | { ok: false; reason: 'platform-disabled' | 'platform-not-ready' | 'platform-error' | 'disabled'
                | 'no-reply-to' | 'institution-cap' | 'platform-cap' };
```

`resolveSender()` returns `ok: true` only when: `platform_config/email.enabled`; `senderVerified`; the EmailJS ids and `senderAddress` are present; fewer than 3 consecutive failures; the institution's settings document exists with `enabled`; a valid address is available (`replyTo`, else `institution.email`); and the institution's and the platform's counters for the current period are under their caps. `fromName` is `"{institution.name} via {appName}"` with control characters, quotes, angle brackets and commas removed and the result truncated (§5.2).

**Period id.** `periodId` is the start date (UTC) of the current EmailJS period: the most recent `periodStartDay` on or before today, clamped to the month's last day (for example day 31 in February is the 28th or 29th). Changing `periodStartDay` starts a new period document; `super_admin` changes it only when EmailJS's billing date changes. The client's clock decides, so a wrong clock only misplaces counts, never bypasses EmailJS's own cap.

No type change to `AuditEventType` is required unless sends are audited (§10).

---

## 5. Welcome email

### 5.1 The messenger statement (mandatory)

Every message built by the payload builder includes, and a unit test enforces:

- **A header strip at the top:** "Sent by {App name} on behalf of {Institution name}."
- **An opening line:** "{Institution name} has created an account for you on {App name}."
- **A footer:** "This message was sent by {App name}, the service {Institution name} uses for its accounts. {App name} only delivers the message on the institution's behalf: {Institution name} is responsible for your account and for this message's content. Replies go to {Institution name} at {reply-to address}, not to {App name}. If you did not expect this email, contact {Institution name} at {reply-to address}."
- **The footer also carries** a link to the **Privacy Policy** and the **Terms of Use**, and says that the personal data in the message is handled by {App name} and its email providers (EmailJS and SMTP2GO), so the recipient has notice from the first message (§12).
- The message **never claims to be the institution's own mailbox** and never says "from the school" without naming the app.
- The institution name, app name and reply-to appear exactly as sent in the headers (§4), so the body and headers agree.
- The **template adds one static line** (the app's name typed into the template, no variables): "Sent through a messaging service on behalf of an institution." A forged request cannot remove or alter it.

### 5.2 Content, subject and escaping

- **Subject:** `"Your {Institution name} account on {App name}"`, sanitised like the From name and truncated to 78 characters. No exclamation marks, all-caps or "free"/"urgent" wording (spam-sensitive).
- **Body (HTML, plain-language):** greeting with the person's name; the opening line above; a button/hyperlink **Go to the sign-in page** (`/login?institution=<id>`), with the URL also printed in full as text; the **email address to sign in with** (their own, the one the message was sent to); the **temporary password**; steps: open the link, confirm the institution shown, type your email and the temporary password, then choose a new password when asked; a note that the password is temporary and the link only works for this institution; then the footer.
- **Plain-text alternative:** an HTML-only message raises spam scores. Check (§14.D) whether the EmailJS template can send a text part; if it cannot, keep the HTML simple (one column, no images) and record the limitation.
- **Escaping:** every interpolated value (recipient name, institution name, app name, password, reply-to) is **HTML-escaped** before it enters `html_body` (the template inserts it unescaped with triple braces), and the login URL is built with `encodeURIComponent`. The password is escaped like any other value, so characters such as `<` or `&` survive.
- **Wording** is owned by the platform owner, kept in one file (`src/lib/email/`), and reviewed before launch (§12, §14.D).

### 5.3 Sending credentials: at creation, Send and Resend

**At creation (the real password is known; no reset needed):**

- a tick-box **Email the credentials to this person** on `AdminCreateUserForm` and on Registrations "Convert to accounts" sends exactly the password typed in the form;
- an opt-in section on the import's commit step, **Email credentials to N students**, sends the shared import password; it shows the institution's remaining quota and stops at the cap, and runs after all rows are created, throttled (§8);
- `institution_admin` and `super_admin` accounts being created have no default password: they get an email only if the admin typed a password, and the email says an administrator set it;
- for `super_admin`, which has no institution of its own, the creation form's selected institution decides the settings used;
- a creation-time send that succeeds stamps `credentialsEmailedAt` and sets `credentialsEmailCount` to 1. A failed or ambiguous send stamps nothing, so the account stays "never emailed".

**Who receives it.** The recipient depends on the account, not on who requests it:

- a **student younger than `guardianAgeThreshold`** (default 16, in `platform_config/email`; age computed from `dateOfBirth` on the day of sending) has the email sent to a **linked guardian**: the first linked parent account with a valid, not-`emailInvalid` address, or, when several qualify, the one the requester or approver picks; never to the child's own address. The message greets the guardian, names the student, and says the password is for the student's account;
- an older student, a parent, or a teacher: their own address;
- if a young student has **no linked guardian with a usable address**, sending is blocked with the reason "This student is under 16 and has no guardian with an email address linked" (the admin links a guardian or shares the password by hand);
- at **creation**, the tick-box for a young student is offered only when a guardian's address is available at that moment (for example Registrations "Convert to accounts" supplies the mother's or father's email); otherwise use Send credentials later, after a guardian is linked;
- the account that is stamped (`credentialsEmailedAt`, the count) and audited is always the **student's**, whoever received the message.

**Afterwards: two separate per-row actions** on the Students, Teachers and Parents lists, **Send credentials** and **Resend credentials**. Their rows are extended with `mustChangePassword`, `credentialsEmailedAt`, `credentialsEmailCount` and `emailInvalid` (the same way `phone2` and `idNumber` were once added). Both are hidden for roles without a default password (`institution_admin`, `super_admin`). Which one is selectable depends only on the account's stored state:

| `mustChangePassword` | Emailed before (`credentialsEmailedAt` present) | Send credentials | Resend credentials |
| --- | --- | --- | --- |
| `true` | No | **Selectable** | Not selectable |
| `true` | Yes | Not selectable | **Selectable** |
| `false` | any | Not selectable | Not selectable |
| missing (older accounts) | any | Not selectable | Not selectable |

A button that is not selectable is **shown disabled with a reason**. A pure function `credentialsEligibility(account, guardians, now, limits)` returns, for each action, either "ok" or the first reason that applies, in this order:

1. `mustChangePassword` is not `true` (false: "This person has already signed in and set their own password."; missing: "This account has no first-sign-in record, so credentials cannot be sent from here. Share the password by hand.").
2. The other action applies ("Credentials were already emailed; use Resend." or "Credentials have not been emailed yet; use Send.").
3. `emailInvalid` is set ("This address was marked unusable.").
4. A student under the guardian-age threshold has no linked guardian with a usable address ("This student is under 16 and has no guardian with an email address linked.").
5. A request for the account is already open ("A request is already waiting.").
6. The 12-email lifetime cap is reached ("This account has reached the limit of 12 credential emails.").
7. The 24-hour cooldown has not passed ("An email was sent in the last 24 hours.").
8. The institution or platform gates block (§4, `resolveSender()`): plain-language reasons such as "Email is turned off for this institution" or "This institution has used its email allowance for this month".

**The sequence (reset first, then email).** Eligibility is re-checked from a **fresh read of the account** at every step, not from the cached list:

1. **Request.** The `institution_admin` presses the enabled button; the app re-reads the account, runs `credentialsEligibility`, and creates a `credential_requests` document with status `requested`. There is at most one **open** request per account (open means `requested`, `approved`, `reset_done` or `send_failed`, that is, not yet finished). The requester may **cancel** it while it is `requested`.
2. **Approval.** The `super_admin` opens the **Credential requests** inbox (all institutions, grouped), sees each request with the person's name, role, institution, type and caps used, and **approves** or **rejects** it (with a short reason), singly or in bulk. On approval the app re-reads the account once more; if it is no longer eligible the request becomes `skipped`.
3. **Reset.** The `super_admin` runs the local script (§14.E). For every `approved` request it re-validates the request itself (it bypasses security rules), resets the account's password to the role default, revokes the account's refresh tokens, makes sure `mustChangePassword` is `true`, writes a `password_reset` audit entry, and sets the request to `reset_done` (or `reset_failed` / `skipped` with a reason). It writes a heartbeat so the inbox can say when it last ran.
4. **Email.** While the `super_admin`'s inbox page is open it listens for `reset_done` requests. For each one it re-reads the account (if `mustChangePassword` is no longer `true` it marks the request `skipped` and sends nothing), checks the gates and quota (`resolveSender()`, §8), builds the email with the **role default password** for the right recipient (the account's own address, or the linked guardian's for a young student), and sends it. On a confirmed send the request becomes `sent`, and the account is stamped (`credentialsEmailedAt` now, `credentialsEmailCount` + 1). On a failed send the request becomes `send_failed` with the reason and a **Retry send** button (no second reset is needed, the account is already at the default). If the page is closed, `reset_done` requests wait and show a **Send now** button when it is opened again.
5. **Status.** The requester sees the request's status on their list; the inbox shows how many requests are waiting and **when the script last ran**.

| Status | Set by | Meaning |
| --- | --- | --- |
| `requested` | institution admin | Waiting for the platform owner |
| `approved` | super_admin | Waiting for the script |
| `rejected` / `cancelled` | super_admin / requester | Closed without a reset |
| `reset_done` | script | Password is now the role default; waiting for the email |
| `reset_failed` | script | The reset did not happen (reason shown); a new request is needed |
| `sent` | super_admin's browser | Email confirmed sent; account stamped |
| `send_failed` | super_admin's browser | Reset done, email failed (reason shown); retry send or share the password by hand |
| `skipped` | any step | No longer eligible when re-checked (reason shown) |

**Consequences to be aware of.** The reset **overrides the person's current password**, including a custom one the admin handed over by hand; the request confirm says so. If the email fails after the reset, the person's old password no longer works and the account sits at the known role default until the email is retried or the password is shared by hand. Between the reset and the person's first sign-in anyone who knows their email address and the role default (which is public knowledge) could sign in, so the reset and the send are meant to run back to back (§13).

### 5.4 Rules

These apply to the creation-time tick-boxes and to the send step of Send and Resend: only when `resolveSender()` is ok, the recipient's cooldown has passed, the lifetime cap is not reached, the address is valid and `emailInvalid` is not set. Best-effort: a failure never undoes account creation; the admin sees a clear message and can fall back to sharing the password by hand.

---

## 6. Login deep link

`LoginPage` reads `?institution=<id>` (React Router's search params):

- Present: skip the "choice" view and show the form; `LoginFormView` preselects that institution once `fetchAllInstitutions()` resolves (no extra read, the directory is already fetched). The parameter survives "← Back" within the page.
- Unknown id: ignore it (show the normal dropdown). The existing post-login institution gate still applies, so a wrong id can never sign someone into the wrong institution.
- The link carries no email or password. The e2e login helper starts at `/login` without the parameter and is unaffected.

---

## 7. Deferred: confirmation email

Scrapped for now (2026-10-03); it may be added later. The idea was a follow-up email, "You have signed in and changed your password", sent after the user's first successful password change.

If it returns, it slots in without new infrastructure:

- **Hook point.** `src/scenes/(auth)/change-password/index.tsx`, after `updatePassword` and the `mustChangePassword: false` write both succeed (`navigate("/dashboard")` must not wait for it).
- **Same machinery.** The same `sendEmail()` wrapper, `resolveSender()` and messenger statement, kill switch and quota guard (§8); it would take the cost to two emails per new account.
- **Once only.** A `passwordChangedEmailedAt` field on the user document would guard against duplicates; the owner would need to be allowed to write it alongside the existing `mustChangePassword` clear (keeping the `passwordFlagOk` check intact in `firestore.rules`).
- **Best-effort.** If sending is blocked, nothing is sent and nothing is shown.

---

## 8. Limits, failures and abuse protection

### 8.1 Budgets that apply to every send

| Budget | Free limit | Reset | At the limit |
| --- | --- | --- | --- |
| **EmailJS** (binding, platform-wide) | 200 requests/month, 1 request/second | Its billing date | Further requests dropped |
| SMTP2GO monthly | 1,000/month | Start of its billing cycle | Rejected, not queued; **rejected sends still count** |
| SMTP2GO daily / hourly | 200/day; 25/hour until a sender domain is verified (lifted on verification) | Rolling | Daily excess queues; hourly excess is limited |

### 8.2 Enforcement logic (client-side, so best-effort)

1. **Reserve-then-send.** Increment `email_usage/{periodId}` (`total` and `byInstitution.<id>`, by 1) *before* calling EmailJS. After a **clear failure** (the request never reached SMTP2GO: a 4xx from EmailJS, a network error) write a **-1** compensation; after an ambiguous failure keep the reservation (a rejected SMTP2GO send still costs quota). The rules allow exactly +1 or -1 steps and never below 0 (§9).
2. **Platform cap.** Warn the admin at 80% of `monthlyLimit`; hard-stop at `monthlyLimit`.
3. **Per-institution cap.** `monthlyCap` (or `defaultInstitutionCap`) so one school cannot use everyone's allowance.
4. **Per-recipient cooldown and cap.** At most one credentials email per account every 24 hours and **12 in the account's lifetime** (`credentialsEmailedAt`, `credentialsEmailCount`); the first Send and every Resend count; the cap is never reset, not even by Request Password Change.
5. **Throttle** to one send per second (EmailJS's limit) in bulk, one retry on a 429 or network error, then stop and report. Until the sending sub-domain is verified, SMTP2GO limits the account to 25 an hour, so bulk sends stay small.
6. **Quota meter** in the UI ("12 of 50 this month for your institution"), read from the current `email_usage` document (one read), with the manual flow as the fallback at the cap.
7. **Kill switch** (`platform_config/email.enabled`), read once per session and cached; `email_settings/config.enabled` stops one institution.

### 8.3 Failure handling

`sendEmail()` maps every outcome to one of these, shows a short message, and updates `email_usage` (`consecutiveFailures`, `lastError`). The status codes are what EmailJS's REST endpoint returns for each class of problem (confirm the exact codes in §14.D):

| Outcome | Meaning | Action |
| --- | --- | --- |
| Success (200) | Handed to SMTP2GO | `consecutiveFailures = 0`; stamp the user (`credentialsEmailedAt`, count + 1) |
| Rate limited (429) or network error | Too fast, or offline | One retry after a pause; then count as a failure |
| Bad request or unknown service/template (400/404) | Wrong ids or parameters | Failure; show "Email setup needs attention"; write the -1 compensation |
| Not allowed (401/403) | Origin not on the allowlist, key wrong or account disabled | Failure; show "Email is temporarily unavailable"; write the -1 compensation |
| Service error (412 or 5xx) | SMTP2GO rejected the sender, authentication failed or quota reached | Failure; keep the reservation (it may have counted); show "Email is temporarily unavailable" |

**Credential-request failures** are separate from the table above: a `reset_failed` request means no email is sent and its reason is shown (the account is untouched, or already reset); a `send_failed` request means the account **is already at the role default**, so the fix is **Retry send** or sharing the password by hand. A send failure counts toward `consecutiveFailures` like any other.

After **3 consecutive failures** every send is blocked (`platform-error`) until `super_admin` clears it from the Email settings card, which shows `lastError`. A stale `senderVerified` (a DNS record removed) surfaces here as repeated 412s rather than silently.

### 8.4 Abuse protection (accepted risk)

The EmailJS public key, service id and template id are not secrets but are visible to every admin's browser and in the network traffic of each send; anyone with an admin login, or anyone who copies them, can call the API directly with a spoofed Origin and burn the platform's 200 (an email denial of service for every institution) or send arbitrary text from the platform's address, which could get the SMTP2GO account suspended for every institution. Under EmailJS's terms the account holder is **solely responsible** for every message sent through the service, and spam or phishing can lead to termination, so a forged or abusive request could cost the platform its **only** EmailJS account (and its multiple-free-accounts rule means a replacement cannot be a second free account). This is the main cost of staying client-only and of a single shared account.

Mitigations: restrict allowed domains to the live site in the EmailJS dashboard, leave "non-browser applications" off, consider reCAPTCHA, keep the **static footer in the template** (§5.1), keep the kill switch ready, and cap every institution. The provider's monthly cap is the real stop; the counters only constrain honest use. **Revisit trigger (§15):** move sending behind a free server function when a second institution goes live, when any abuse is seen, or when EmailJS is upgraded.

### 8.5 Bounces and bad addresses

SMTP2GO suppresses an address after a hard bounce, so later sends to it are rejected (and count). There is no webhook without a server, so an admin who sees a bounce in the SMTP2GO dashboard (free: 5 days of history) marks the account's address as unusable (`emailInvalid`); the app then skips it and shows why. Many students have no real or unique email address: such accounts are never emailed, and the admin shares the password by hand. Keep the bounce rate under 8%.

### 8.6 Monitoring

Bounces, spam marks and rejections are visible in the SMTP2GO dashboard; usage in the EmailJS dashboard and in the Email settings card's usage panel (§15). Webhooks and the activity API need a server or a secret key and are out of scope.

---

## 9. Firestore rules and free-tier impact

**Rules (`firestore.rules`, new blocks only; the institutions and users rules are not widened):**

- `platform_config/email`: readable by admins (the values are not secrets); writable by `super_admin` only.
- `institutions/{id}/email_settings/config`: readable by that institution's admins and `super_admin`; **create** and delete by `super_admin` only; **update** by `super_admin` (any field) or by that institution's `institution_admin` when `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['enabled'])`.
- `email_usage/{periodId}`: admins may read. **Create** (the first send of a period): `total == 1`, `byInstitution` has exactly the caller's own institution with value 1, `consecutiveFailures` 0. **Update:** `total` and the caller's own institution's entry change together by exactly +1 or -1 and stay at or above 0 (checked with `byInstitution.diff(...).affectedKeys().hasOnly([myInstitutionId()])`); `consecutiveFailures` and `lastError` may be set by an admin; `super_admin` may reset `consecutiveFailures`. Teachers, students and parents: none.
- `credential_requests/{id}`: **create** by an `institution_admin` only for their own institution, with `status == 'requested'`, `requestedBy == request.auth.uid` and only the fields of the type (the app, not the rules, prevents a second open request); **read** by `super_admin` (all) and by that institution's admins (queries must filter on `institutionId`); **update** by the requester only to move `requested` to `cancelled`, and by `super_admin` for `approved`, `rejected`, `sent`, `send_failed` and `skipped` from their allowed previous status. `reset_done`, `reset_failed` and the heartbeat are written by the script through the Admin SDK (rules do not apply). No deletes. Indexes: `status` + `requestedAt` (inbox) and `institutionId` + `requestedAt` (institution view) in `firestore.indexes.json`.
- `platform_config/credential_script`: readable by `super_admin`; written only by the script.
- `platform_config/legal`: readable by every signed-in user; writable by `super_admin` only.
- `users/{uid}` **owner write of the acceptance record**: the owner may add `termsVersion` and `termsAcceptedAt` (never other fields) when `termsAcceptedAt == request.time` and `termsVersion == get(platform_config/legal).currentTermsVersion`, either together with the existing first-sign-in flag clear or on the re-acceptance page; this extends the owner allow-list and leaves `passwordFlagOk` intact.
- `users/{uid}`: `credentialsEmailedAt`, `credentialsEmailCount` and `emailInvalid` are written by the existing admin update clause (admins within their institution); the owner-edit allow-list and the `passwordFlagOk` check are unchanged, so an owner cannot write them. `profileEditDiff` ignores these fields, so they do not create `profile_edit` audit entries.

**Free-tier cost.** Per email: one `email_usage` write (plus a compensating write on a clear failure) and one user-document write; one cached read of `platform_config/email` and one of the settings document per session, and one read of the current usage document for the meter. Per Send or Resend request: one create and about four small status updates, plus the fresh account reads (a few single-document reads). The only listener is a scoped one on `credential_requests` with `status in ['approved', 'reset_done']`, active only while the `super_admin`'s inbox page is open (reads happen only on changes). The script runs on the owner's machine with the service account; its reads and writes are the same few documents. At under about 100 accounts a month this is a few hundred writes against Spark's 20,000 a day. The single usage document is written at most once a second (the send throttle). No Cloud Functions, no hosting, no Blaze-only features.

---

## 10. Audit (optional, decide at implementation)

A `credentials_emailed` entry in `audit_log` would record who emailed whom and when (never the password); changes to the email settings and `platform_config/email` by `super_admin` are also worth logging. If added, mirror the new `AuditEventType` values in `firestore.rules` and `auditRules.test.ts` (the drift test fails otherwise), and add their labels in `auditEvents.ts`.

---

## 11. Deferred: Forgot Password and Request Password Change

- **Forgot Password.** The decision is **admin-only resets**, matching item 21 ("one self-service change, then admin-request-only") and `LOGIN_ARCHITECTURE.md`. The inert "Forgot password?" text becomes a **request**: the user enters their email and institution, and the institution's admin is notified (in-app, optionally by email through the same wrapper). The password is then reset and re-emailed through the same credential-request flow (§5.3; the reset script is described in `ROLE_DEFAULT_PASSWORD_RESET_SCRIPT_SPEC.md`). A browser cannot set another user's Auth password, and a self-service link would need either Firebase's own reset email (sent from the Firebase project address) or a trusted server.
- **Request Password Change** (not yet existing, on the User Profile page). Same shape: a request that notifies the institution's admin. Not designed here, but it must honour this **contract**: the flow sets `mustChangePassword` back to `true` **only together with a reset of the account's password to the role default**, which means it goes through the same reset script (that script already sets the flag and the default password). That re-enables **Resend credentials**, because the account still has `credentialsEmailedAt`. The 12-email lifetime cap is **not** reset. An owner cannot set the flag `true` (the `passwordFlagOk` rule), and no browser role should either: consider tightening the users rule so only the script (Admin SDK) sets it.
- Both reuse `sendEmail()` and the quota rules, so they need no new infrastructure. Their wording, flows and any new `AuditEventType` get their own spec.

---

## 12. Legal, privacy and consent prerequisites

A checklist of what has to exist before the first real recipient is emailed. It is **not legal advice**: have someone qualified review it, including the Jamaican **Data Protection Act** (data protection standards, transfers outside Jamaica, children's data) and any law that applies where an institution operates. It is based on EmailJS's Terms and Conditions (2026-09-28), Privacy Policy (2026-09-08) and nFADP page (2024-03-08), kept in `internal/regarding-emailjs/policies/`. Those copies are printed web pages that cut a few lines at page boundaries, so re-read the live pages before relying on a detail. The full text of the Disclaimer, Privacy Policy and Terms of Use belongs in a separate legal-documents spec; this section records only what the email feature requires of them.

### 12.1 What the providers' documents mean for this feature

| Topic | What the documents say | Consequence for this feature |
| --- | --- | --- |
| Roles | EmailJS has no direct relationship with the people we email (Users-of-Users); the account holder is the **Controller**, responsible for security, integrity, authorised use, and consents and notices; recipients' requests go to the account holder | The platform (and each institution for its own people) owns notices, lawful basis, access and erasure requests; EmailJS and SMTP2GO only process on instruction. A recipient-rights process is needed (§12.4). |
| Responsibility for messages | "Each user is solely responsible for all of his, her, or their messages"; no responsibility for third-party claims | The platform answers for every message; the Terms of Use must put the institution's content, authority and recipients' lawful basis on the institution and carry matching indemnities. Reinforces §8.4. |
| Spam and consent | Spam, and bulk or mailing-list email to people who have not specifically agreed, are prohibited | These are one-to-one account notifications expected because an institution created the account; never marketing; the message says why it was sent; the Terms of Use have each institution confirm its authority and relationship. |
| One free account | Multiple free accounts are unacceptable use | One platform account only (§2.3). |
| Inactivity | Free accounts inactive for over a year may be deleted | Keep the account in regular use. |
| Warranty and SLA | "As is"; no SLA on free | A manual fallback (share the password by hand) must always exist. |
| Retention and logging | 30 days; request activity can be switched off per template; request metadata (Events page) is kept | Switch activity logging off for the template (§14.B); disclose the metadata and the 30 days in the Privacy Policy. |
| Storage and transfer | US servers on AWS; subprocessors Cloudflare, AWS, Zendesk, Sentry; Singapore authorities; DPA covers GDPR, UK and Swiss law | A recipient's name, email address, institution and temporary password leave Jamaica for the US. Check the Jamaican transfer rules and whether consent or another safeguard is needed; accept EmailJS's DPA; disclose the processors, locations and Singapore disclosure rule. |
| Age | Account holders 16 or older; EmailJS collects nothing from under 13 | Concerns the account holder, not our recipients. Children's data remains the platform's and the institution's responsibility, hence the guardian rule (§5.3). |
| SMTP2GO | Recipients must have a legitimate relationship; senders control content; region chosen by the relay host | Same relationship rule; choose and record a region; read its terms and any data-processing terms (§14.D check 19). |

### 12.2 Recipients who are children

A student younger than `guardianAgeThreshold` (default 16) is never emailed directly; a linked guardian receives the credentials (§5.3). The threshold is a platform setting so counsel can change it. Whether a guardian's acceptance is needed for a young student's account is a question for the legal review (§12.3 describes where it would sit).

### 12.3 Notice and acceptance

- **Disclaimer pop-up (notice, pre-login).** It appears on first visit, or on `/`, and blocks the redirect to `/login` until accepted. Acceptance is remembered in the browser only (`localStorage`, with the version), so it is **notice, not proof**.
- **Per-account acceptance (proof, at first sign-in).** The first-sign-in step (the forced password change) shows the Terms of Use and Privacy Policy links with a required tick-box; submitting writes `termsVersion` and `termsAcceptedAt` (server time) on the person's user document together with the existing `mustChangePassword: false`. `platform_config/legal.currentTermsVersion` holds the current version; when it is newer than a person's `termsVersion`, `Protected` sends them to a re-acceptance page before the dashboard. For a young student the page tells them a parent or guardian must review and accept on their behalf (to be confirmed in the legal review). Rules in §9.
- The welcome email links to both documents (§5.1), so recipients can read them before they sign in.

### 12.4 What the three documents must say about email

**Disclaimer pop-up (short, plain language, links to the full documents, accept button; declining keeps the person on `/`):**

- who operates the app and how to contact them, and that each institution runs its own accounts and is responsible for its people and data;
- that the app sends account emails **on behalf of the institution**, from the app's own address, containing a **temporary password**, with replies going to the institution; that the person should keep it private, change it at first sign-in and tell the institution if an email was unexpected;
- that email is handled by third-party providers (EmailJS, with US servers, and SMTP2GO) and may be processed outside Jamaica;
- the guardian rule for young students;
- links to the Privacy Policy and Terms of Use, the version shown, and a statement that acceptance is recorded at first sign-in.

**Privacy Policy (email-specific content):**

- the data sent for each email (name, address, institution name and reply address, sign-in link, temporary password) and the purpose (account notifications);
- the processors and sub-processors and their locations (EmailJS: US servers on AWS, subprocessors Cloudflare, AWS, Zendesk, Sentry; SMTP2GO: the chosen region), the transfer safeguards (the DPAs) and the Singapore-authority disclosure rule;
- retention: EmailJS up to 30 days of request metadata (and history if logging were on), SMTP2GO 5 days of activity, the platform's own `credentialsEmailedAt`, count and `emailInvalid`, and the credential-request records; the password is never stored;
- who the controller is for each part (institution versus platform), how a person or guardian asks for access, correction or erasure (the institution first, then the platform) and the timelines, and the right to complain to the Jamaican Information Commissioner;
- the guardian rule and how children's data is treated.

**Terms of Use (email-specific content):**

- the platform is a **messenger**, not the author of the institution's messages; delivery is not guaranteed; quotas, per-institution caps and the right to suspend or stop sending;
- each institution's obligations: authority to give recipients' details, a lawful basis and any consents or notices for its students, guardians and staff, a correct institution name and email, and no marketing or unsolicited use of the feature;
- no forging, spoofing or misuse of the email feature; the consequences (suspension, liability);
- reliance on third parties and their terms and outages (EmailJS, SMTP2GO), with no SLA;
- limits of liability and indemnities that mirror EmailJS's own (as-is service, third-party claims);
- governing law and disputes for the platform's own terms, and that a separate institution agreement and data-processing terms apply between the platform and each institution.

### 12.5 Launch prerequisites

Before the first real recipient is emailed: the Disclaimer, Privacy Policy and Terms of Use are written and reviewed; an institution agreement with data-processing terms exists; EmailJS's DPA is accepted; the SMTP2GO region is chosen and its terms read; EmailJS request logging is off; the Jamaican law check (transfers, children, any controller registration) is done; the acceptance gate (§12.3) and the guardian rule (§5.3) are built and tested.

---

## 13. What to keep in mind

1. **One shared EmailJS cap for the whole platform:** 200 requests a month on free (about 200 welcome emails if nothing is resent). Every institution competes for it, so the per-institution cap and the quota meter are the core controls. EmailJS Personal ($9, 2,000 a month) is the first upgrade; after that SMTP2GO's free 1,000 a month binds.
2. **Two billing cycles:** EmailJS and SMTP2GO reset on their own dates (not the calendar month); rejected SMTP2GO sends still count.
3. **Client-side limits are bypassable** (§8.4). The ids are visible to every admin's browser; a forged request can burn the quota or send text from your address.
4. **Header and HTML injection.** `institution.name`, the recipient's name and the reply address are free text: strip control characters, quotes, angle brackets and commas and truncate the From name and subject; HTML-escape every value in the body; validate the reply address; keep Reply-To `super_admin`-only so replies cannot be redirected; the "via {App}" suffix stays so the app is always visible.
5. **Your sending identity is shared.** One sub-domain, one reputation: one institution's bounces or complaints affect all. Keep the bounce rate under 8%, mark bad addresses, and be ready to switch an institution off (`enabled`).
6. **Use a sub-domain for sending** (for example `mail.{your-domain}`), not the main domain, so a reputation problem does not touch the domain you use for anything else; publish DMARC (start with `p=none`, tighten after monitoring).
7. **The terms matter:** SMTP2GO's free plan is "for trial purposes and low amounts of email" and requires a legitimate relationship with recipients and control of the content; the new-account review can hold mail. Plan the paid-plan trigger (§15).
8. **The password is in the inbox and, unless request logging is switched off, in EmailJS's history (up to 30 days),** valid only until the forced first change. For Send and Resend it is always the role default, which the script has just set.
9. **Never send from dev or QA:** `VITE_EMAIL_ENABLED` off everywhere but production; QA specs create real accounts.
10. **Many students have no real or unique email address;** bounces still count.
11. **No self-service reset:** a user who forgets the password must ask their admin.
12. **An institution without an email address cannot send** (no Reply-To): onboarding must capture one before enabling.
13. **A legal and trust check is worth doing** on the messenger wording and on sending credentials by email, before launch (§12).
14. **Resets depend on the platform owner.** Nothing is reset until the owner runs the script, so Send and Resend are not instant; the inbox shows how many requests are waiting and when the script last ran. Run it with `--watch` while working through a batch.
15. **Exposure window.** Between the reset and the person's first sign-in the password is the role default, which is public knowledge (it is in the client bundle and the docs). Anyone who knows the person's email address could sign in during that window. Approve, reset and send back to back, and avoid leaving `reset_done` requests unsent (the revoked tokens also sign the person out of any active session).
16. **The reset overrides whatever password the person or the admin chose,** including one handed over by hand. The request confirm and the inbox say so.
17. **The cap can lock an account out of email.** After 12 credential emails the buttons stay disabled for good; the platform owner shares the password by hand.
18. **You are solely responsible for every message sent through EmailJS** (its terms), and abuse can end the account. One free account only; keep it active (inactive free accounts may be deleted after a year); there is no SLA or warranty on free (§12.1).
19. **The recipient has not agreed to anything when the first email arrives.** Notice comes from the email footer and the Disclaimer pop-up; proof comes from the per-account acceptance at first sign-in (§12.3). Young students are emailed through a guardian (§5.3).
20. **Recipients' data leaves Jamaica** (EmailJS on US servers; SMTP2GO in the chosen region). Get the Jamaican transfer and children's-data rules checked and the processors disclosed before launch (§12).

---

## 14. What has to be configured and done (before any code)

### A. SMTP2GO (platform owner)

1. Create a free account with a monitored business address and complete the **new-account review** (initial quota; excess is held until reviewed). Choose the **region** (§12).
2. Choose the sending **sub-domain** (for example `mail.{your-domain}`) and add it under **Sending > Verified Senders > Sender domains**. Add the **three CNAME records** SMTP2GO shows (DKIM, return path, tracking) at your DNS host; propagation can take up to 48 hours. Verifying a domain lifts the **25-per-hour** cap and gives SPF/DKIM alignment.
3. Publish a **DMARC** record for the domain (`_dmarc` TXT, start with `p=none` and a reporting address), and tighten it after monitoring.
4. Pick the platform sender address on that sub-domain (for example `no-reply@mail.{your-domain}`); it needs no mailbox because replies go to Reply-To. Consider a monitored contact address for abuse reports.
5. Create **one SMTP user** (a dedicated username and password for EmailJS); note the host (`mail.smtp2go.com`, or a regional host) and port (587 STARTTLS, 2525, or 465 SSL). Keep its **unsubscribe footer off**; optionally set a per-user rate limit and "Restrict Senders" to the platform address.
6. Turn on usage **notifications** for team members (80/90/100% of the monthly allowance).
7. **Ongoing:** check the activity log (5 days on free) for bounces, spam marks and rejections; keep the bounce rate under 8%; track the monthly cycle; decide when to move to a paid plan (§15).

### B. EmailJS (platform owner)

8. Create the account (free plan) and add **one email service of type custom SMTP**: the SMTP2GO host, port, and the SMTP user and password from step 5. Note the **service id**. (The SMTP password lives only here; never in the app, Firestore or the repository.)
9. Create **one generic template** (note the **template id**): To Email `{{to_email}}`, From Name `{{from_name}}`, Reply To `{{reply_to}}`, Subject `{{subject}}`, content `{{{html_body}}}` (HTML) followed by the **static footer line** (§5.1) typed into the template with no variables. The From address is the service's (the platform sender).
10. In the account: allow only the live site's domain (and localhost for development), leave "non-browser applications" off, consider reCAPTCHA; note the **public key** and the **billing date** (`periodStartDay`). In the template's **Settings** tab turn **activity logging off** (and check that the temporary password then no longer appears in the history; request metadata is still kept), accept EmailJS's **DPA**, and keep the account holder 16 or older. Use **one free account only**.
11. **Ongoing:** watch monthly usage in the dashboard; keep the account in use (a free account inactive for over a year may be deleted); request metadata is kept up to 30 days; decide when to upgrade (Personal, 2,000 a month).

### C. App and data (developer, then platform owner)

12. Add `VITE_APP_URL` (the canonical live URL) and `VITE_EMAIL_ENABLED` (false everywhere except production) to `.env.example` and to Vercel's settings. The app name comes only from `platform_config/email.appName`. **No SMTP password, EmailJS private key or API key in any `.env` or in the repository.**
13. Create `platform_config/email` through the Email settings card (`senderAddress`, `senderVerified` after step 2, `appName`, `emailjs` ids, `monthlyLimit` 200, `periodStartDay`, `defaultInstitutionCap`, kill switch).
14. For each institution: `super_admin` creates the settings document (`replyTo` if different from the institution email, `monthlyCap`), then the institution's admin (or `super_admin`) switches `enabled` on. Institutions do nothing else.

### D. Checks before building (done from the provider dashboards and a throwaway test mailbox, since the app's settings card does not exist yet)

15. EmailJS custom SMTP reaches the SMTP2GO relay (EmailJS's dashboard "Test it" is enough) and a message is delivered with From = the platform address.
16. The template's **From Name** and **Reply To** variables are honoured; the From name shows as "{Institution} via {App}"; a reply goes to `reply_to`; the static footer line appears.
17. Authentication results in the received headers: **SPF, DKIM and DMARC pass** for the sub-domain, to Gmail, Yahoo, Outlook and a school/business domain; inbox versus spam for each; whether a plain-text part can be sent.
18. A send from an unverified address is rejected and counted; the hourly cap behaviour before and after domain verification; the daily and monthly caps as SMTP2GO displays them (verify the 5 verified senders and the review details on its support pages).
19. EmailJS refuses a request from an unlisted origin and blocks non-browser calls; the status codes it returns for each outcome in §8.3; what it does at the monthly cap; that its terms and SMTP2GO's allow this multi-institution use and set out processor terms (§12).
20. The messenger wording passes a read-through by someone outside the project (and, if possible, a legal check).

### E. The credential reset script (platform owner, with the developer)

21. **Prerequisites:** Node, `firebase-admin` (already a dev dependency) and a service-account key saved as `scripts/service-account.json` (gitignored, never committed, kept only on the owner's machine), exactly as for the other `scripts/*.mjs` tools.
22. **The script** `scripts/process-credential-requests.mjs` (written in implementation) takes `--live` (a **dry run is the default**), `--watch` (stay running and handle requests as they arrive; without it, process everything `approved` and exit) and `--key=<path>`.
23. **For each `approved` request it re-validates everything itself** (it bypasses security rules): the requester exists and, if an `institution_admin`, belongs to the request's institution; the approver is a `super_admin`; the target exists, is in that institution, has a role with a default password (`student`, `parent`, `regular_teacher`, `senior_teacher`) and has `mustChangePassword === true`; `credentialsEmailCount` is below 12; and the request's type matches the state table (`send` only if there is no `credentialsEmailedAt`, `resend` only if there is one). Then it resets the Auth password to the role default, revokes refresh tokens, sets `mustChangePassword: true`, writes a `password_reset` audit entry, sets `reset_done`, and updates the heartbeat. Anything else ends `skipped` or `reset_failed` with a short reason. It is idempotent per request id.
24. **Keep the role defaults in sync** in three places: `ROLE_DEFAULT_PASSWORDS` in the app, the import's shared password, and the scripts (the new script and `reset-role-default-passwords.mjs`). The pure validation function lives in a small shared module under `scripts/` so it can be unit-tested.
25. **A runbook** (§19) explains how to run it, what each status means and what to do on `reset_failed`.
26. **Script checks, on the QA institution with a test account:** a dry run lists the intended changes and writes nothing; a live run changes the password, the old password is rejected, tokens are revoked, the flag is `true`, the audit entry exists and the status is `reset_done`; a second run does nothing; an ineligible target (flag false, no default role, admin role, wrong institution, over the cap, type not matching the state) ends `skipped` or `reset_failed`; the heartbeat updates.

---

## 15. Operations: rollout, rollback, usage and upgrade triggers

- **Usage panel** in the super_admin Email settings card: platform total against `monthlyLimit`, each institution's count against its cap, the date of the next reset, `consecutiveFailures` and `lastError`, with a button to clear a block. Institution admins see only their own meter.
- **Rollout:** (1) build with `VITE_EMAIL_ENABLED` off and the e2e interception (§17); (2) production: platform configured and checks passed, one **pilot institution** enabled with a small cap (for example 20); (3) widen caps and enable further institutions one at a time, watching bounces and spam placement.
- **Rollback:** switch `platform_config/email.enabled` off (no deploy); the manual flow of sharing passwords by hand always remains. Reverting the app is also safe: the settings and counters are additive.
- **Upgrade triggers (numbers):** at **80% of 200 in two months of three**, move EmailJS to Personal; at **about 800 SMTP2GO sends in a month**, or on a failed review, move SMTP2GO to a paid plan or switch to a mailbox (option B, §2.3).
- **Reset script runbook:** the owner runs `process-credential-requests.mjs --live` (batch) or with `--watch` when working through requests; the inbox shows "script last ran X ago" and the number waiting, and flags a request left `approved` for more than a day; rolling back means rejecting or cancelling requests (nothing has changed until the script runs) and switching `enabled` off (no deploy).
- **Server-function trigger:** a hosted function would also remove the dependency on the owner's machine for resets (it could replace the request queue); move sending behind a free server function (Netlify Free allows commercial use, 125,000 invocations a month; Cloudflare Workers Free 100,000 requests a day) when **a second institution goes live, when any abuse is seen, or when EmailJS is upgraded.** A function can keep the SMTP2GO API key secret, check the caller's Firebase token and enforce quota for real; only `sendEmail()` changes.

---

## 16. Separation of concerns

| Who | Owns | Does not touch |
| --- | --- | --- |
| **Platform owner** (`super_admin`) | The sending sub-domain, its DNS records and DMARC; the SMTP2GO account and SMTP user; the one EmailJS account, service, template, allowlist and billing; the kill switch, platform and per-institution caps; each institution's settings document and Reply-To; **approving or rejecting credential requests, running the reset script, holding the service-account key, and sending the email** from their browser; watching bounces, quota, failures and the providers' terms; the Disclaimer, Privacy Policy, Terms of Use, institution agreement, processor terms (EmailJS DPA) and the acceptance record; paying for an upgrade; being the **sender of record** for every message. | An institution's mailbox or its users' data beyond what administration already allows. |
| **Institution** (`institution_admin`) | Its people and their email addresses; a correct institution **name** (shown in the From name and the message) and email (the default Reply-To); pausing or resuming its own sending; **requesting** Send or Resend credentials for its own accounts and cancelling a request; **reading and answering replies** at the Reply-To address; marking bad addresses; a legitimate relationship with every recipient and the lawful basis, consents and notices for its students, guardians and staff (guardian contact details for young students); sharing credentials by hand when email is blocked. | EmailJS, SMTP2GO, DNS, the sender address, the Reply-To, any cap, any password reset, or an approval. It cannot make the app send as itself. |
| **The app** | `resolveSender()`, `credentialsEligibility()` and the gates; the request queue and the inbox; building the HTML, subject, the login link and the **mandatory messenger statement**; sanitising and escaping every value; passing `from_name`, `reply_to` and `to_email` as template parameters; counting sends per institution and for the platform; cooldowns and the 12-email cap; failure handling; the quota meter, kill switch and clear block messages; keeping secrets out of the bundle. | Reading or sending from any institution's mailbox; claiming to be the institution; resetting a password itself; guaranteeing inbox placement. |
| **The reset script** (on the owner's machine) | The authoritative re-validation of every approved request; the password reset to the role default; token revocation; the `password_reset` audit entry; the request status and the heartbeat. | Sending email, quotas, institution settings, or anything not in an `approved` request. |

Each message is sent *by the platform, as a messenger*, from the platform's address; the institution is the named party, the person responsible for the message's content and the destination for replies.

---

## 17. Testing Considerations

- Standing gate: `npx tsc -b`, `npx eslint .`, `npx vitest run`, `npm run build`.
- **Unit:** `resolveSender()` (ok; every block reason: platform disabled, not ready, platform error, institution disabled or no settings, no reply-to, institution cap, platform cap; `fromName` is "{institution} via {app}", `fromEmail` always the platform address, `replyTo` the institution's); From-name and subject sanitising (control characters, quotes, angle brackets, commas, length); HTML escaping of every interpolated value, including a password containing `<`, `&` and quotes; payload builders (the welcome HTML contains the messenger header, opening line and footer with the institution name, app name and reply-to; the link `<VITE_APP_URL>/login?institution=<id>` with the id URL-encoded; the password only where intended; no stray placeholders; it never says the message is from the institution without naming the app); the quota guard (reserve, compensate on a clear failure, thresholds, platform and per-institution counters, per-recipient cooldown and cap, period id including day 29-31, period reset, kill switch, three consecutive failures); the failure mapper (§8.3); the deep-link parser (known, unknown and missing ids); the recipient rule (age from `dateOfBirth` against `guardianAgeThreshold`, guardian selection, no guardian or an unusable address, older students, parents and staff to their own address, the stamped account always the student); the acceptance gate (no record, older version, current version, redirect to the re-acceptance page); `credentialsEligibility()` (every row of the §5.3 table, `mustChangePassword` true, false and missing, with and without `credentialsEmailedAt`, admin roles, `emailInvalid`, an open request, the 12-email cap, the 24-hour cooldown, and the order in which reasons are reported); the request state machine (every allowed and refused transition); the script's pure validation function (each re-validation rule in §14.E, including type versus state, wrong institution, admin role, flag false and over the cap).
- **Rules tests:** `platform_config/email` writable by `super_admin` only; the settings document (create and delete `super_admin` only; an `institution_admin` may change only `enabled`, only for their own institution); `email_usage` create and +1/-1 updates only, own institution's entry only, never below 0; an owner cannot write `credentialsEmailedAt`, `credentialsEmailCount` or `emailInvalid`, and may write `termsVersion` and `termsAcceptedAt` only with the current version and server time; `platform_config/legal` is `super_admin`-write only; `credential_requests` (an `institution_admin` creates only for their own institution with status `requested`, cancels only their own `requested` request, cannot approve; `super_admin` makes the allowed transitions; reads are institution-scoped for admins; no deletes); teachers, students and parents have no access.
- **Live e2e (new spec `e2e/17-email.spec.ts`):** `/login?institution=<id>` opens the form with that institution selected; an unknown id shows the normal dropdown; creating an account with sending off (flag) sends nothing; with Playwright intercepting `https://api.emailjs.com/**` (`page.route`, no real request leaves the machine) the welcome request carries the right From name, Reply-To, subject and messenger text once, each state in the §5.3 table renders the right enabled or disabled button with its reason, a request is created and cancelled, an Admin SDK write simulates `reset_done` (the script itself is not run in e2e) and the `super_admin`'s inbox then sends exactly one intercepted email and stamps the account, and a blocked institution disables the action with its reason. Never send real email from automated specs.
- **Manual (after §14.D):** one real welcome email to test mailboxes at Gmail, Yahoo, Outlook and a school/business domain; check the From name, the messenger text, Reply-To, SPF/DKIM/DMARC results and spam placement.

---

## 18. Implementation Order (what has to be done)

1. **Checks (§14.D)** and record the results (especially checks 15, 16, 17 and 19) in this file's header.
2. Config and data: `platform_config/email`, the settings document, `email_usage`, rules and rules tests, and the super_admin "Email settings" card (platform settings, per-institution `replyTo`, cap and enable, usage panel).
3. `src/lib/email/`: `resolveSender()`, sanitising and escaping, `sendEmail()` (plain `fetch`), payload builders with the messenger statement, quota guard and counters, failure mapper, flags, with unit tests.
4. Login deep link (`?institution=`) and its e2e.
5. Welcome email at creation: the tick-boxes on `AdminCreateUserForm` and Convert, then the quota meter.
6. Credential requests: extend the Students, Teachers and Parents row mapping, add the **Send credentials** and **Resend credentials** buttons (state table and reasons), the bad-address marker, the `credential_requests` collection with its rules, indexes and rules tests, and the `super_admin` **Credential requests** inbox with the automatic send step.
7. The reset script `scripts/process-credential-requests.mjs`: shared pure validator, dry run, `--live`, `--watch`, heartbeat, its unit tests and the runbook.
8. Import commit-step sending (bulk, throttled).
9. Legal prerequisites (§12): the Disclaimer pop-up, the first-sign-in acceptance record and re-acceptance gate, the guardian recipient rule, the footer links; the documents themselves are written and reviewed before any real recipient is emailed.
10. Docs (§19) and a PR; then, separately, the Forgot Password / Request Password Change request flows.

---

## 19. Documentation updates (part of this change)

- `docs/guides/USER_GUIDE.md`: a section for institution admins (what the welcome email is and what recipients see, sending at creation, requesting **Send credentials** and **Resend credentials** and what the statuses mean, the quota meter, why sending can be blocked, marking bad addresses, that replies come to the institution), a super_admin section (Email settings, the usage panel and the Credential requests inbox), and a note for new users about the email and the link.
- A new platform-owner **runbook** for §14 and §15 (SMTP2GO and EmailJS setup, DNS records, adding an institution, running the reset script, request statuses and `reset_failed`, what to do at a cap, on bounces or on a block), kept with the other operational docs.
- `docs/miscellaneous-specs/ROLE_DEFAULT_PASSWORD_RESET_SCRIPT_SPEC.md`: a cross-link to the new `process-credential-requests.mjs` script and a note that the role defaults are kept in sync across them.
- `docs/login/LOGIN_ARCHITECTURE.md`: the `?institution=` parameter and the unchanged institution gate.
- `docs/firebase/firebase-rules.md` and `docs/firebase/MISCELLANEOUS_INFO.md`: the new collections (`platform_config`, the settings subcollection, `email_usage`, `credential_requests`) and their rules and indexes.
- **Legal documents (a separate spec and the documents themselves):** the Disclaimer text, the Privacy Policy, the Terms of Use and the institution agreement with data-processing terms, with the email requirements in §12.4.
- `.env.example`: the two new variables.
- `docs/ISSUES_AND_GAPS.md`: a new entry for the limits in §8 and §13 (client-side enforcement, shared quota, shared reputation, password in the email and provider history, the messenger sender, the owner-run reset script and the exposure window).
- `internal/in-regards-to-dev-notes/DEV_NOTES_ANALYSIS.md` item 21: link to this spec.

---

## 20. Risks and limits (summary)

- **Shared, small quota:** 200 requests a month for the whole platform; a per-institution cap is the only fairness control. One welcome email per new user is about 200 users a month in total (a 30-student import is 30 emails). Send and Resend emails (up to 12 per account) and any future confirmation email (§7) eat into this.
- **Client-side enforcement is bypassable:** the public ids can be used to exhaust the quota or to send text from the platform's address; revisit trigger in §15.
- **Shared sender reputation:** one institution's bounces or complaints affect everyone; the app (not the institution) is the sender of record.
- **Identity perception:** mail naming an institution from another domain can look like phishing; the "via {App}" name, the messenger statement and DMARC alignment are the mitigations.
- **Institution-controlled text** (name, reply address) feeds the From name, subject and Reply-To: sanitise, escape, and keep Reply-To `super_admin`-only.
- **Resets depend on the platform owner's machine and availability:** Send and Resend wait until the owner runs the script; the inbox shows the backlog and when the script last ran. A hosted function would remove this (§15 trigger).
- **Exposure window:** from the reset until the person's first sign-in the password is the role default, which is public knowledge; anyone with the person's email address could sign in. Reset and send back to back.
- **The reset overrides the person's current password** (including one handed over by hand) and signs them out; if the email then fails the person is locked out until a retry or a by-hand handover.
- **The service-account key** on the owner's machine can change any account's password: keep it local, gitignored and backed up safely; the script authorises each request itself and writes an audit entry.
- **The 12-email lifetime cap** can leave an account unable to be emailed again; the owner then shares the password by hand.
- **SMTP2GO free plan:** "low amounts of email" wording for a commercial platform, new-account review, rejected sends count against quota, monthly reset on its billing cycle, no webhooks without a server; a paid plan is the trigger for growth or a review problem.
- **Two providers to keep working:** EmailJS and SMTP2GO; an outage or a terms problem at either blocks all sending (the manual flow remains, and three consecutive failures block sending automatically).
- **Password in the inbox and, unless request logging is off, in the provider's history (up to 30 days),** valid only until the forced first change.
- **Sole responsibility and account termination:** EmailJS makes the account holder solely responsible for every message and may end the account for spam or phishing; a forged request could cost the only account, and a second free account is not allowed. Revisit trigger in §15.
- **No SLA or warranty on the free plan,** and inactive free accounts may be deleted after a year.
- **Consent timing and children:** the first email arrives before the recipient has seen any notice; young students are emailed through a guardian; the acceptance record (§12.3) gives proof from first sign-in.
- **Cross-border transfer:** recipients' data goes to US servers (EmailJS) and the chosen SMTP2GO region; the Jamaican transfer and children's-data rules must be checked before launch.
- **Privacy and compliance** work (§12) is a launch prerequisite, especially for minors.
- **The relay path, the dynamic From name and Reply-To, and a plain-text part are unproven** (§14.D, checks 15-17); the alternative transport is a mailbox at the app's domain through EmailJS directly (§2.3, option B).
- **Bounces still count,** and many students have no real or unique email address.
- **No self-service reset:** a user who forgets the password must ask their admin.
