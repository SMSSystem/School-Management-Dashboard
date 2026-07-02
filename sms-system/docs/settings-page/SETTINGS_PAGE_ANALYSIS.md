# Settings Page: Card Audit and Deferral Notes

## Status

The settings page (`/settings`, rendered by `src/scenes/(dashboard)/settings/index.tsx`) is
currently **hidden from the sidebar for all roles**. The sidebar link was removed from
`src/components/Menu.tsx`; the route registration in `src/App.tsx` remains intact so the
page is still reachable by direct URL during development.

This document records the card-by-card audit that led to that decision, identifies which
cards contain actively misleading placeholder content, and provides guidance for when the
page is revisited.

---

## Architecture Overview

The page is a single component (`SettingsPage`) with no state management or Firestore
integration. Every input, toggle, and select uses `defaultValue` / `defaultChecked` —
uncontrolled React elements whose values are never read, persisted, or sent anywhere. All
data displayed is hardcoded.

Role-conditional rendering is driven by `useAuth().role` and two derived booleans:

```ts
const isAdmin = currentRole === 'institution_admin' || currentRole === 'super_admin';
const isTeacher = currentRole === 'regular_teacher' || currentRole === 'senior_teacher';
```

Cards are grouped into four visibility tiers:

| Tier | Condition | Roles |
|---|---|---|
| Universal | always shown | all six roles |
| Teacher-only | `isTeacher` | `regular_teacher`, `senior_teacher` |
| Student-only | `currentRole === 'student'` | `student` |
| Parent-only | `currentRole === 'parent'` | `parent` |
| Admin-only | `isAdmin` | `institution_admin`, `super_admin` |

---

## Card-by-Card Audit

### Universal cards (visible to all roles)

#### Account
**Verdict: Keep — with one sub-row removed**

Contains four items:

| Sub-item | Verdict | Notes |
|---|---|---|
| Password | Keep | Firebase Auth `updatePassword()` is a straightforward future implementation. The "Change password" button is a clean placeholder. |
| Two-factor authentication | Keep | Firebase supports phone MFA. Non-trivial but a legitimate future feature. Acceptable as a shell. |
| Active sessions | **Remove** | Hardcoded "2 devices signed in". The Firebase JS SDK exposes no multi-device session enumeration — that requires a Cloud Functions + Firestore session-tracking layer that does not exist. The hardcoded copy actively misleads any reviewer or stakeholder. |
| Security alerts | Keep | "Email me when a new device signs in" is standard; reasonable future feature. |

---

#### Notifications
**Verdict: Keep**

Email, SMS, and push toggles plus a Digest frequency select. Nothing claims these are live.
A clear future preference layer. No misleading content.

---

#### Preferences
**Verdict: Keep**

Language, Timezone, Date format, and Theme dropdowns. The Theme select is notable — the
application already has a functional dark/light mode toggle in the navbar, implemented via
Tailwind's `dark:` class prefix and `localStorage`. The Preferences Theme select is not
wired to that mechanism. When the page is revisited, this select should either be wired to
the existing theme logic or removed. Until then, it is an acceptable shell.

---

#### Privacy
**Verdict: Keep**

Profile visibility select plus two toggles. The "Share data with guardians" toggle uses a
role-based `defaultChecked` value (unchecked for teachers, checked for others), which shows
design intent. No hardcoded fake data. Fine as a placeholder.

---

#### Accessibility
**Verdict: Keep**

Text size select, High contrast toggle, Reduced motion toggle. A standard accessibility
preference block. Non-misleading and a legitimate future feature.

---

### Teacher-only cards (`regular_teacher` | `senior_teacher`)

#### Gradebook preferences
**Verdict: Keep**

Grade scale view (Letter / Percentage / GPA) and default gradebook categories. Maps directly
to future teacher-specific Firestore preferences. Clean shell.

#### Class defaults
**Verdict: Keep**

Auto-close attendance toggle and late work policy select. Legitimate teacher workflow
settings. No misleading content.

#### Assignment notifications
**Verdict: Keep**

"Notify on missing work" and "Daily submission summary" toggles. Standard teacher alert
preferences. Fine as a shell.

---

### Student-only cards

#### Student notifications
**Verdict: Keep**

Assignments due, Exam schedules, and Results published toggles. Maps directly to
notification preferences for the student role. No misleading content.

#### Student privacy
**Verdict: Keep**

Profile visibility select and "Share achievements" toggle. Appropriate student-specific
privacy controls. Fine as a shell.

#### Parent / guardian visibility
**Verdict: Keep**

"Share attendance" and "Share grades" toggles. Directly relevant to the parent visibility
model. Fine as a shell.

---

### Parent-only cards

#### Child notifications
**Verdict: Keep**

Attendance alerts, Grades posted, and Announcements toggles. Standard parent notification
preferences. No misleading content.

#### Contact preferences
**Verdict: Keep**

Preferred contact window select and "Allow phone calls" toggle. Legitimate future UX. Fine
as a shell.

---

### Admin-only cards (`institution_admin` | `super_admin`)

#### User management defaults
**Verdict: Keep**

"Require admin approval" toggle and Default role select. Both map directly to institution
configuration fields that would be stored in the institution's Firestore document. Closest
of all admin cards to being implementable. Fine as a shell.

---

#### Permissions templates
**Verdict: Remove**

"Apply strict student template" and "Apply teacher leadership template" toggles. No
permission template system exists anywhere in the codebase — no Firestore schema, no
enforcement logic, no data model. The labels describe concepts that have not been designed.
This card invents a feature rather than acting as a placeholder for one.

---

#### School profile
**Verdict: Remove or wire immediately**

Three plain inputs with hardcoded values:

- `"Lighthouse Academy"`
- `"123 Main St, Anytown, USA"`
- `"contact@lighthouse.edu"`

These values are completely fictitious and bear no relation to the signed-in institution.
A settings page that shows a fake school name to an admin who manages a real institution is
actively misleading. This card should either be wired to read and write the institution's
Firestore document before the page is re-exposed, or removed until that work is done.

---

#### Academic structure
**Verdict: Keep**

Current term select, Grading scale select, and "Require attendance notes" toggle. All three
map to real institution configuration fields (term calendar, grading policy, attendance
policy). No hardcoded fake data. Fine as a shell.

---

#### Integrations
**Verdict: Remove**

Three selects:

- **LMS / SIS** — Google Classroom, Canvas, Schoology
- **Email provider** — Google Workspace, Microsoft 365, SMTP relay
- **SMS provider** — Twilio, MessageBird, Vonage

Each select implies a live integration that does not exist. Connecting to any of these
services requires OAuth tokens, API credentials, webhook infrastructure, or a server-side
relay — none of which are present. Each integration represents a major standalone feature.
Displaying selects that appear to choose between live providers, when no provider connection
exists, is actively misleading to any stakeholder reviewing the product.

---

#### Security and audit
**Verdict: Keep**

Audit log retention select (6 / 12 / 24 months), "Require 2FA for staff" toggle, and
"Lock accounts after 5 failed logins" toggle. All three are real security policy settings
that would be stored in Firestore and enforced by Firebase Auth rules or Cloud Functions.
The audit log collection already exists in the Firestore schema. Fine as a shell.

---

#### Billing & subscription
**Verdict: Remove**

Displays:

```
Plan: District Plus
1,200 users · Next renewal: Feb 15, 2026
```

with a "View invoices" button that does nothing. The project runs on Firebase Spark (free
tier). There is no billing concept, no subscription management, and no payment
infrastructure. The hardcoded plan name and renewal date are fictional. This is the most
misleading card on the page — it implies a billing relationship that does not and cannot
exist in the current architecture.

---

## Summary: Recommended Removals

When the settings page is revisited, the following cards should be removed before the page
is re-exposed in the sidebar:

| Card | Scope | Primary reason |
|---|---|---|
| Active sessions sub-row (inside Account) | Universal | Hardcoded "2 devices"; Firebase SDK cannot enumerate multi-device sessions without a backend layer |
| Permissions templates | Admin-only | No permission template concept exists in the codebase |
| School profile | Admin-only | Hardcoded fake institution name, address, and email |
| Integrations | Admin-only | Selects imply live LMS/email/SMS connections that do not exist |
| Billing & subscription | Admin-only | Hardcoded fictional plan and renewal date; no payment infrastructure exists |

All other cards are acceptable as unimplemented shells and can remain when the page is
re-exposed.

---

## Implementation Notes for When This Page Is Revisited

### Wiring the Theme select to the existing theme mechanism

The navbar already persists the dark/light preference via `localStorage`. The Preferences
Theme select should read from and write to the same key, or the select should be removed in
favour of pointing users to the existing navbar control.

### School profile

The institution's Firestore document (`institutions/{institutionId}`) is the correct source
of truth for name, address, and contact email. The school profile form should `getDocs` on
load and `updateDoc` on save, scoped to the signed-in user's `institutionId`.

### Active sessions

Enumerating active sessions requires writing a session record to Firestore on every sign-in
(e.g., `users/{uid}/sessions/{sessionId}`) and deleting it on sign-out or expiry. The
"Sign out all" action would batch-delete all session records and call
`firebase.auth().currentUser.getIdToken(true)` to revoke the server-side token. This is a
Cloud Functions task, not a pure client-side one.

### Integrations

Each provider in the Integrations card represents an independent integration project.
Google Classroom and Canvas require OAuth 2.0 flows and API client libraries. Twilio and
MessageBird require server-side credential storage and a relay endpoint. None should be
added to this settings card without a dedicated implementation plan.

---

## Files Involved

| File | Role |
|---|---|
| `src/scenes/(dashboard)/settings/index.tsx` | Full settings page component — all cards defined here |
| `src/components/Menu.tsx` | Sidebar navigation — Settings link removed from all roles |
| `src/App.tsx` | Route registration for `/settings` — left intact; page reachable by direct URL |
| `src/lib/AuthContext.tsx` | Provides `role` consumed by `SettingsPage` for conditional rendering |
