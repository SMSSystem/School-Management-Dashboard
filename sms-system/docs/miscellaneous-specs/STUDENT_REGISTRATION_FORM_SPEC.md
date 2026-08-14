# Student Registration Form — Feature Spec

> **Status:** Proposed — not started
> **Feature:** Public, unauthenticated new-student registration, per institution, with an admin review/conversion workflow
> **Routes (new):** `/register` (institution picker), `/register/:institutionId` (the form itself)
> **Route (changed):** `/login` (split into a Login/Registration landing)
> **Route (new, authenticated):** `/dashboard/registrations` (institution_admin review list)
> **Primary roles:** Anyone (unauthenticated) can submit; `institution_admin`/`super_admin` review and convert submissions to real accounts
> **Reference:** `internal/read-only/registration-form.pdf` — a printed public registration form from a different vendor's SMS product (Comsol Jamaica), used as a field-shape reference only, not a UI template
> **Depends on:** an implementation plan (deferred — this document is the design spec only, per the "spec now, plan later" decision)

---

## Overview

This feature adds a public, self-service "Student Registration Form" that a prospective family can fill out **without an account** — reachable from a new "Registration" option on the login screen. The submitted data lands in a per-institution review queue; nothing is created automatically. An `institution_admin` reviews each submission and, when ready, converts it into real accounts using the app's existing admin-driven user-creation flow (`AdminCreateUserForm.tsx`), pre-filled from the submission.

This is the first feature in the app that accepts data from a genuinely anonymous, unauthenticated visitor. Every other write path in this codebase assumes the caller is already signed in with a role. That single fact drives most of the unusual design choices below (a separate public directory instead of opening up the real `institutions` documents, Firebase App Check, narrow and defensive security rules, no automatic account creation).

**What this feature is not:** it does not replace or change how accounts are actually created (`AdminCreateUserForm.tsx` is untouched in its core mechanics), does not send any email, does not upload photos (deferred), and does not give institutions without an opted-in directory entry any registration traffic at all.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| What happens on submit | Writes a review-queue document only — no Firebase Auth account, no `users` document, nothing automatic | The only alternative (auto-create accounts on submit) requires Cloud Functions with the Admin SDK, which requires upgrading off the free Spark plan. This app has no Cloud Functions today and every other feature has been deliberately kept Spark-compatible. |
| Login page "Institution" dropdown | Cosmetic pre-selection only (loads that institution's branding before the rest of the form) | `AuthContext.signIn(email, password)` takes no institution parameter today — a user's institution is derived server-side from their `users/{uid}` document after authentication, not supplied by the client. Making the dropdown an actual validation gate would require a new public email→institution lookup, a bigger and unnecessary security-surface change. |
| How institutions are listed for registration | A new, separate, curated `registration_directory` collection — not a public-read rule on the real `institutions` documents | `institutions/{id}` currently requires `isSuperAdmin() \|\| myInstitutionId() == institutionId` to read at all. Reusing it publicly would mean auditing every field on that document for what's safe to expose. A separate collection with only display-safe fields keeps the real document exactly as locked-down as it is today. |
| Who curates the directory | Each `institution_admin` opts their own institution in/out from their own dashboard | Self-service, no `super_admin` bottleneck — an institution can turn registration on for an enrollment period and off again without asking anyone. |
| Abuse protection | Firebase App Check (reCAPTCHA v3), enforced on the new public write | This is the app's first unauthenticated write surface and the project has zero App Check/CAPTCHA/rate-limiting anywhere today. Still Spark-plan compatible — no Cloud Functions required. |
| Guardian data model | No schema change to the account model itself — `student_parents` is already many-to-many (confirmed: `list/students/[id]/index.tsx` already links/unlinks multiple parent accounts per student today). Add one new field: `relationship` | The junction collection already supports two parents per student structurally. What's missing is a way to say *which* parent a given link represents, which becomes meaningful the moment two-parents-per-student is an intentional, expected case rather than an edge case. |
| Which guardians become real accounts | Admin chooses per submission, not automatic | Handles families who want one shared login, a parent who declines an account, or a single-parent household where only one guardian's info was ever provided. |
| Conversion tooling | A "Convert to accounts" action pre-fills the existing create-student/create-parent forms from the submission data | Reuses `AdminCreateUserForm.tsx` exactly as it works today (including its secondary-Firebase-app account-creation trick) — this feature does not reimplement account creation, only pre-fills it. |
| Review status | A status field that includes conversion state (`pending` → `reviewed` → `converted`, or `rejected`) — not just seen/unseen | Lets the review list distinguish "still needs accounts created" from "already handled" without a separate lookup against the `users` collection. |
| Academic year | Every submission is tied to an academic year (`academicYearId`), matching the institution's existing `academicYears` data | Matches the reference form's own "2026-2027" framing and keeps the review list organized across enrollment cycles rather than one ever-growing undifferentiated list. |
| Duplicate detection | A non-blocking flag, computed client-side against existing students and other pending submissions by name + date of birth | Surfaces a warning to the reviewing admin without blocking a legitimate resubmission or a sibling with a similar name. |
| Email notifications | Out of scope entirely | This app has no email-sending infrastructure (no Cloud Functions, no third-party email API integration) anywhere. Adding one is a separate infrastructure decision, not something to bundle into this feature. |
| Photo upload | Fully designed (§Photo Upload — Design), implementation still deferred | Avoids standing up a second public write surface (Firebase Storage rules + a *separate* App Check enforcement toggle) in the same pass as the new public Firestore write — but designed now rather than left as a one-line deferral, so a future pass doesn't re-derive it from scratch. Optional field when built, not required. |
| Un-rejecting a rejected submission | Supported — `rejected` can transition back to `reviewed` | Avoids forcing a family to redo the entire form over an admin's change of mind; resumes at `reviewed` rather than `pending` since it genuinely was reviewed once already. |
| PII / data retention | Documented policy only, no automated enforcement | Automatic scheduled deletion needs Cloud Functions, which this whole feature is designed to avoid. Converted/rejected submissions should be manually deleted by the reviewing institution per its own policy, using the existing per-row delete action. |
| Rate limiting beyond App Check | Documented residual risk, no client-side mitigation added | App Check attests the request is genuine, not that a genuine visitor won't submit many times. A client-side cooldown was considered and rejected — trivially bypassable, and mostly creates a false impression of protection. True rate-limiting needs Cloud Functions. |

---

## Architecture at a Glance

```text
Unauthenticated visitor
  │
  ├─ GET /login ─────────────────────────────► two buttons: "Login" / "Register"
  │                                                  │
  │        ┌─────────────────────────────────────────┤
  │        ▼                                         ▼
  │   existing /login form                      GET /register
  │   (+ cosmetic Institution                         │
  │      dropdown, branding only)              reads registration_directory
  │                                             (public, opted-in institutions only)
  │                                                    │
  │                                                    ▼
  │                                          GET /register/:institutionId
  │                                          the registration form itself
  │                                                    │
  │                                       submit (App Check token required)
  │                                                    ▼
  │                          institutions/{id}/enrollmentRegistrations/{regId}
  │                          (public create; readable only by that institution's admins)
  │
  └─ (separately) institution_admin, signed in
              │
              ▼
     /dashboard/registrations
     review list, filter by status/academic year
              │
       "Convert to accounts" (per chosen guardian)
              │
              ▼
     AdminCreateUserForm, pre-filled from the submission
     (existing account-creation mechanism, unchanged)
```

---

## Data Model

### `registration_directory/{institutionId}` — NEW, top-level, public-readable

The doc ID matches the real `institutions/{institutionId}` ID, but this is a **separate collection** containing only display-safe fields — never the real institution document.

```text
registration_directory/{institutionId}
  name:                  string     // denormalized from institutions/{id}.name at write time
  logoUrl:               string?    // denormalized from institutions/{id}.logoUrl
  acceptingRegistrations: boolean   // the institution_admin's opt-in toggle
  updatedAt:             Timestamp  // serverTimestamp(), set on every toggle
  updatedBy:             string     // uid of the institution_admin who last toggled it
```

**Notes:**

- Written only by that institution's `institution_admin`/`super_admin`, from a new toggle on an existing settings-style page (see §Institution Directory Opt-In below).
- The registration picker page only ever queries `where('acceptingRegistrations', '==', true)` — an institution that has never opted in simply has no document here at all, or has one with the flag `false`.
- Denormalizing `name`/`logoUrl` (rather than the picker page reading the real `institutions/{id}` document, which it cannot — see §Design Decisions) means this document needs to be re-synced if an institution renames itself or changes its logo. Accepted as a minor staleness risk, consistent with how this app already denormalizes names elsewhere (`teacherName`, `subjectName`, etc.) rather than joining at read time.

### `institutions/{institutionId}/enrollmentRegistrations/{registrationId}` — NEW, nested

Follows the same `institutions/{institutionId}/{collection}` nesting pattern established by the rest of this app (see `docs/overhaul/FIRESTORE_INSTITUTION_NESTING_SPEC.md`) — every collection created from this point forward uses the nested shape from day one, never the legacy flat pattern.

```text
institutions/{institutionId}/enrollmentRegistrations/{registrationId}
  institutionId:      string                              // for institutionFieldMatchesPath() validation
  academicYearId:     string                               // references institutions/{id}/academicYears/{id}
  academicYearName:   string                                // denormalized, e.g. "2026-2027"
  status:             'pending' | 'reviewed' | 'converted' | 'rejected'
  submittedAt:        Timestamp                              // serverTimestamp()
  reviewedAt:         Timestamp?                             // set when status first leaves 'pending'
  reviewedBy:          string?                                // uid of the admin who reviewed it
  possibleDuplicate:  boolean                                // computed client-side at submit time, see §Duplicate Detection

  // ── Student ──────────────────────────────────────────────────────────
  student: {
    lastName:          string
    firstName:         string
    middleName:        string?
    requestedClass:     string      // free text — the class/grade the family is requesting; not a real classId, since no account/enrollment exists yet
    dateOfBirth:        string      // ISO "YYYY-MM-DD"
    gender:             'Male' | 'Female'
    email:               string?     // optional — many new students won't have one yet
    lastSchoolAttended: string?
  }

  // ── Guardians — 0, 1, or 2 present ─────────────────────────────────────
  mother: {
    lastName:    string
    firstName:   string
    address:     string
    contact:     string
    email:       string
    occupation:  string?
    work:        string?
  } | null

  father: {
    lastName:    string
    firstName:   string
    address:     string
    contact:     string
    email:       string
    occupation:  string?
    work:        string?
  } | null

  // ── Conversion tracking — populated as an admin acts on this record ────
  convertedStudentUid:  string?   // set once the student account is created
  convertedMotherUid:   string?   // set only if the admin chose to create this account
  convertedFatherUid:   string?   // set only if the admin chose to create this account
```

**Notes:**

- `mother`/`father` are each either a full nested object or `null` — never a partially-filled object. The registration form itself requires at least one of the two to be non-null (see §Registration Form Fields); the schema does not force both.
- No `parentGuardianEmail`/top-level "Student Name" duplicate fields the way the reference PDF has them (a summary "Student Name" field above the detailed section, and a separate top-level "Parent/Guardian Email") — those exist in the reference form to pre-populate the rest of the form as the user types, a UX nicety this spec doesn't require. The structured `student.*`/`mother.*`/`father.*` objects are the single source of truth.
- `requestedClass` is deliberately a free-text string, not a `classId` reference into `institutions/{id}/classes` — a prospective student has no class assignment yet, and requiring the public form to enumerate real class options would mean opening up another collection's read rule publicly. The admin assigns a real `classId` at conversion time, same as they do for any new student today via `AdminCreateUserForm`.
- `possibleDuplicate` is a boolean flag only — see §Duplicate Detection for how it's computed and what it does (and doesn't) do.

### `student_parents/{parentId}_{studentId}` — EXTENDED (existing collection)

One new field on an already-shipped, already-used collection:

```diff
  parentId:      string
  studentId:     string
  institutionId: string
+ relationship:  'mother' | 'father' | 'guardian' | 'other'
```

**Notes:**

- Optional at the schema level for backward compatibility — existing links created before this feature has no `relationship` value and should be treated as `'guardian'` by any UI that reads it (a generic fallback, not a guess at which parent it actually was).
- Written by `list/students/[id]/index.tsx`'s existing "Add parent" flow (updated to prompt for a relationship alongside the parent picker) and by the registration conversion flow (set explicitly from which section — `mother` or `father` — the account being created came from).

---

## TypeScript Types

Add to `src/lib/firebase.ts`:

```ts
export type RegistrationStatus = 'pending' | 'reviewed' | 'converted' | 'rejected';

export type ParentRelationship = 'mother' | 'father' | 'guardian' | 'other';

export type RegistrationGuardian = {
  lastName: string;
  firstName: string;
  address: string;
  contact: string;
  email: string;
  occupation?: string;
  work?: string;
};

export type EnrollmentRegistrationDocument = {
  institutionId: string;
  academicYearId: string;
  academicYearName: string;
  status: RegistrationStatus;
  submittedAt: Timestamp | string;
  reviewedAt?: Timestamp | string;
  reviewedBy?: string;
  possibleDuplicate: boolean;
  student: {
    lastName: string;
    firstName: string;
    middleName?: string;
    requestedClass: string;
    dateOfBirth: string;
    gender: 'Male' | 'Female';
    email?: string;
    lastSchoolAttended?: string;
  };
  mother: RegistrationGuardian | null;
  father: RegistrationGuardian | null;
  convertedStudentUid?: string;
  convertedMotherUid?: string;
  convertedFatherUid?: string;
};

export type RegistrationDirectoryEntry = {
  name: string;
  logoUrl?: string;
  acceptingRegistrations: boolean;
  updatedAt: Timestamp | string;
  updatedBy: string;
};
```

Update the existing `student_parents` link type (wherever it's currently modeled — likely inline at each call site rather than a shared type today, per a quick check of `ParentForm.tsx`/`list/students/[id]/index.tsx`; introduce a shared type as part of this change if none exists):

```ts
export type StudentParentLink = {
  parentId: string;
  studentId: string;
  institutionId: string;
  relationship?: ParentRelationship;
};
```

---

## Permission Model

### Role matrix

| Action | Unauthenticated | `super_admin` | `institution_admin` | Other roles |
|---|---|---|---|---|
| Read `registration_directory` (opted-in institutions only) | ✅ | ✅ | ✅ | ✅ |
| Toggle own institution's `acceptingRegistrations` | ❌ | ✅ (any) | ✅ (own institution only) | ❌ |
| Submit a registration (create `enrollmentRegistrations` doc) | ✅ (App Check required) | — | — | — |
| Read `enrollmentRegistrations` for an institution | ❌ | ✅ (any institution) | ✅ (own institution only) | ❌ |
| Update `enrollmentRegistrations` (status, conversion tracking) | ❌ | ✅ | ✅ (own institution only) | ❌ |
| Delete a registration | ❌ | ✅ | ✅ (own institution only) | ❌ |

No role below `institution_admin` has any visibility into registrations — not even `senior_teacher`. Reviewing prospective-family PII (addresses, contact info, occupations) is kept to the same admin tier that already handles account creation, not extended to teaching staff.

---

## Firestore Security Rules

Two new top-level/nested match blocks, plus one small addition to the existing `student_parents` block. Written to match this codebase's established helper-function vocabulary exactly (`isSignedIn()`, `isAdminOrAbove()`, `myInstitutionId()`, `inMyInstitution()`, `institutionFieldMatchesPath()`) — no new helpers needed except one, noted below.

Two new helper functions, added alongside the existing `isSignedIn()`/`isAdmin()`/etc. block at the top of the file:

```javascript
// Field-shape + size validation for a public, unauthenticated create — this
// is the actual bypass-resistance for enrollmentRegistrations below, not
// just a hasAll() presence check. Every free-text field gets an explicit
// size cap: Firestore's 1MiB per-document limit bounds any single write,
// but many medium-sized spam documents could still exhaust the shared daily
// write quota well before any one document approached that limit (see
// Firebase Free-Tier Analysis) — so size caps matter even though they can't
// stop submission *volume* on their own.
function isValidRegistrationStudent(student) {
  return student.keys().hasAll(['lastName', 'firstName', 'requestedClass', 'dateOfBirth', 'gender'])
    && student.lastName is string && student.lastName.size() <= 100
    && student.firstName is string && student.firstName.size() <= 100
    && student.requestedClass is string && student.requestedClass.size() <= 50
    && student.dateOfBirth is string && student.dateOfBirth.size() <= 10
    && student.gender in ['Male', 'Female'];
}

function isValidRegistrationGuardian(guardian) {
  return guardian.keys().hasAll(['lastName', 'firstName', 'address', 'contact', 'email'])
    && guardian.lastName is string && guardian.lastName.size() <= 100
    && guardian.firstName is string && guardian.firstName.size() <= 100
    && guardian.address is string && guardian.address.size() <= 300
    && guardian.contact is string && guardian.contact.size() <= 50
    && guardian.email is string && guardian.email.size() <= 254 && guardian.email.matches('.*@.*');
}
```

```javascript
// ── Registration Directory (public) ─────────────────────────────────────
// Anyone may read — this is the whole point, it's what the public
// registration picker queries. Only that institution's own admin (or
// super_admin) may write their institution's entry, and only to their own
// institutionId — this is a TOP-LEVEL collection, so there is no path
// segment to validate against the way institutionFieldMatchesPath() does
// for nested collections; the check has to compare against the document ID
// directly.
match /registration_directory/{institutionId} {
  allow read: if true;
  allow write: if isAdminOrAbove()
    && (isSuperAdmin() || myInstitutionId() == institutionId);
}

// ── Enrollment Registrations (nested, public create) ────────────────────
// The one deliberately public write in this entire app. Hardened against
// the bypass vectors an anonymous caller could actually attempt: a forged
// academicYearId that doesn't correspond to a real academic year, an
// out-of-range gender value, wrong-shape guardian objects, planting a
// fake reviewedAt/reviewedBy/converted*Uid at create time to skip the
// review workflow entirely, and unbounded string sizes (see the helper
// functions above).
match /institutions/{institutionId}/enrollmentRegistrations/{registrationId} {
  allow read: if isAdminOrAbove() && inMyInstitution(institutionId);

  allow create: if institutionFieldMatchesPath(institutionId)
    && request.resource.data.status == 'pending'
    && request.resource.data.possibleDuplicate == false
    && request.resource.data.keys().hasAll(['academicYearId', 'academicYearName', 'student', 'mother', 'father'])
    && exists(/databases/$(database)/documents/institutions/$(institutionId)/academicYears/$(request.resource.data.academicYearId))
    && isValidRegistrationStudent(request.resource.data.student)
    && (request.resource.data.mother == null || isValidRegistrationGuardian(request.resource.data.mother))
    && (request.resource.data.father == null || isValidRegistrationGuardian(request.resource.data.father))
    && (request.resource.data.mother != null || request.resource.data.father != null)
    && !('convertedStudentUid' in request.resource.data)
    && !('convertedMotherUid' in request.resource.data)
    && !('convertedFatherUid' in request.resource.data)
    && !('reviewedAt' in request.resource.data)
    && !('reviewedBy' in request.resource.data);

  allow update: if isAdminOrAbove()
    && inMyInstitution(institutionId)
    && institutionFieldMatchesPath(institutionId)
    // Only status/review/conversion-tracking fields may ever change — the
    // submitted family data itself is immutable once submitted, the same
    // "audit trail" posture already used for disciplinaryActions' edit
    // rule. possibleDuplicate is the one deliberate exception: it's
    // computed by the *reviewing admin's* client (the public submitter has
    // no read access to check it against — see Duplicate Detection), not
    // locked as immutable like student/mother/father/academicYearId.
    // status is allowed to move freely among all four values, including
    // rejected -> reviewed (un-reject) — this is an admin-only action
    // already, so the rule doesn't further constrain which transitions are
    // "valid"; the review page's own UI is what decides which buttons to
    // show for a given current status.
    && request.resource.data.student == resource.data.student
    && request.resource.data.mother == resource.data.mother
    && request.resource.data.father == resource.data.father
    && request.resource.data.academicYearId == resource.data.academicYearId
    && request.resource.data.status in ['pending', 'reviewed', 'converted', 'rejected'];

  allow delete: if isAdminOrAbove() && inMyInstitution(institutionId);
}
```

```diff
  match /student_parents/{docId} {
    allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
      || resource.data.studentId == request.auth.uid
      || resource.data.parentId == request.auth.uid;
    allow create: if isAdminOrAbove() && writingToMyInstitution();
-   allow update: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
+   // Widened only to permit setting `relationship` after the fact (e.g. a
+   // link created before this feature existed, now being labeled) — every
+   // other field remains immutable via update, matching the create rule's
+   // own field set.
+   allow update: if isAdminOrAbove()
+     && sameInstitution(resource.data.institutionId)
+     && request.resource.data.parentId == resource.data.parentId
+     && request.resource.data.studentId == resource.data.studentId
+     && request.resource.data.institutionId == resource.data.institutionId;
    allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
  }
```

**On App Check enforcement:** Firestore rules do not need (and cannot cleanly express) an App Check check inline — App Check is enforced at the project/service level via the Firebase Console (Firestore Database → App Check → **Enforce**), not via a rules-file condition. Once enforcement is turned on for Firestore, every request without a valid App Check token is rejected before it ever reaches the rules above, regardless of what the rules say. See §Firebase App Check for the client-side half of this.

**No composite indexes anticipated.** The review list queries `enrollmentRegistrations` with equality filters only (`institutionId` is already implicit in the nested path; optionally `+ status ==` or `+ academicYearId ==`), sorted client-side after fetch — matching the established convention (and the exact same "don't add a server-side `orderBy` without a matching index" caution already documented in `DISCIPLINARY_ACTION_SPEC.md`).

---

## Firebase App Check

**Why:** this feature introduces the app's first-ever unauthenticated write. App Check attests that requests are coming from the app's real, unmodified client (via reCAPTCHA v3 in the browser) rather than a scripted abuse tool hitting the Firestore REST API directly. Without it, `registration_directory`'s public read and `enrollmentRegistrations`'s public create are both wide open to scripted abuse the moment they're deployed.

**Cost/plan impact:** App Check itself is free and does not require the Blaze plan — it's a request-attestation layer on top of Spark-plan Firestore, not a paid product on its own.

### Setup steps

1. **Firebase Console → App Check → Register app.** Choose reCAPTCHA v3 as the provider for the web app. This generates a **site key** (public, safe to ship in client code) and a **secret key** (stays in the Console, never touches the repo).
2. **Add the site key as an env var**, matching the existing `VITE_FIREBASE_*` convention already used for the rest of `firebaseConfig`:

   ```text
   VITE_FIREBASE_APPCHECK_SITE_KEY=<the reCAPTCHA v3 site key>
   ```

3. **Initialize App Check in `src/lib/firebase.ts`**, immediately after `initializeApp` and before anything reads/writes Firestore:

   ```ts
   import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

   export const app = initializeApp(firebaseConfig);

   if (import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY) {
     initializeAppCheck(app, {
       provider: new ReCaptchaV3Provider(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY as string),
       isTokenAutoRefreshEnabled: true,
     });
   }
   ```

   The `if` guard matters for local development: without a configured site key, `initializeAppCheck` throws. Gating it means a developer without App Check env vars set up can still run the app locally against a project with enforcement **off**; enforcement should only be turned on in the Console once the production deploy has the site key wired up (see step 5).
4. **Local development escape hatch:** Firebase supports a **debug token** for App Check in non-production environments (`self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before `initializeAppCheck` runs, in a dev-only code path) — register the generated debug token in the Console so local dev and any CI environment aren't blocked once enforcement is on. Needed only once enforcement (next step) is actually turned on.
5. **Firebase Console → Firestore Database → App Check → Enforce.** Do this **after** the production deploy with the site key is confirmed live (same "confirm the deploy is live before doing anything else" discipline already established for `firestore.rules` deploys in `CUTOVER_RUNBOOK.md`) — enforcing before the client is ready would lock out every legitimate user, not just abusive ones.

### Scope

App Check enforcement in Firestore is project/database-wide, not per-collection — it does not single out `registration_directory`/`enrollmentRegistrations`. Every existing authenticated read/write in the app already goes through the same Firebase SDK instance and will automatically carry a valid App Check token once this is wired up; no other part of the app needs to change.

### Enforcement scope and blast radius — read before turning enforcement on

The implication of "project-wide, not per-collection" is worth stating plainly rather than leaving implicit: **once enforced, every existing authenticated read/write in the entire app also requires a valid App Check token**, not just the new public registration writes. In practice this should be transparent — every Firestore call already goes through the same `db` instance that `initializeAppCheck(app, ...)` attaches to, so an already-signed-in teacher's grade entry or an admin's student edit picks up a token automatically, with no code change needed anywhere else in the app.

The real risk is **availability, not correctness**: if the App Check attestation mechanism itself fails for some population of users — a corporate network blocking Google's reCAPTCHA script, an aggressive ad/tracker blocker, a Google-side outage — those users lose the ability to use *any* part of the app, not just registration, for as long as enforcement stays on and they can't obtain a token. This is a materially bigger blast radius than "protect the new public form" alone implies. See §Operational Security → Incident Response for the rollback plan if this happens.

---

## Security Hardening

Beyond what's already encoded directly in the rules above, three things worth stating explicitly rather than leaving implicit.

### PII and data retention

This feature collects real PII about a minor (name, date of birth) and up to two adults (name, address, contact, email, occupation, employer) — for **every** submission, including ones that are ultimately rejected or duplicates that never become real accounts. There is no automatic deletion: this app has no Cloud Functions, so a scheduled/triggered purge job isn't available without introducing one — a bigger infrastructure decision than this feature warrants on its own, consistent with this document's stance everywhere else.

**v1 approach: a documented policy, not an enforced mechanism.** Once a submission reaches a terminal state (`converted` — the data now lives on the real accounts too, making the original submission redundant; or `rejected` — the family was never enrolled), it should be deleted by the reviewing institution per their own data-retention practice, using the existing per-row delete action on the review page (§`/dashboard/registrations` — Admin Review Page). No automatic timer, no bulk-purge tooling in v1 — an institution that wants a stricter/faster retention practice than "whenever an admin gets to it" enforces that manually today, same as any other cleanup task in this app. Automatic, scheduled retention enforcement is listed in §Deferred Items.

### Input validation and injection

Firestore is not a SQL-style datastore — there's no query-injection risk from submitted text ending up in a `WHERE` clause the way there would be with raw SQL string concatenation. The two real risks are:

1. **Storage/quota abuse via oversized payloads.** Addressed directly in the hardened create rule above — every free-text field has an explicit `.size()` cap, not just a presence check.
2. **Display-context XSS**, if submitted text is ever rendered unsafely somewhere down the line. React escapes rendered text by default in JSX — this app does not use `dangerouslySetInnerHTML` anywhere today, and this feature's admin review page must not become the first place that does. **Explicit convention for this feature: render every field from an `EnrollmentRegistrationDocument` as plain JSX text content, never via `dangerouslySetInnerHTML` or any HTML-interpreting sink**, including if this data is ever fed into `@react-pdf/renderer` (used elsewhere in this app for report cards) — that renderer has its own text-escaping behavior to verify at whatever point registration data is ever rendered to PDF, which nothing in this spec currently does.

Data-*quality* issues (a legitimate-looking but wrong submission, a typo, an intentionally offensive-but-technically-valid name field) are handled by the human review step already designed into this feature — not a technical validation problem.

### Rate limiting — residual risk, not solved here

App Check proves a request came from this app's real, unmodified client. It does **not** cap how many submissions one real, legitimate-looking browser session can send — a person who opens the registration page and submits it fifty times in a row sails through App Check every time. True rate-limiting (e.g. "max N submissions per IP per hour") needs server-side state and enforcement, which on this app's architecture means Cloud Functions.

**Decision for v1: documented residual risk, no client-side mitigation.** A client-side submit-button cooldown was considered and explicitly not added — it stops nothing a moderately determined actor couldn't bypass (a fresh page load resets any client-held cooldown state), and its main effect would be creating an impression of protection without providing real protection. App Check, the per-field size caps, and the ability to flip `acceptingRegistrations` off in seconds (§Operational Security → Incident Response) are this feature's actual defenses; anything beyond that is future work contingent on Cloud Functions.

---

## Operational Security

### Audit log integration

Every status transition on a registration (`reviewed`, `converted`, `rejected`, and un-reject back to `reviewed`) writes an entry to the existing `institutions/{institutionId}/audit_log` collection, reusing its established shape exactly — no new audit mechanism:

```ts
await addDoc(institutionSubcollection(institutionId, 'institutions', institutionId, 'audit_log'), {
  eventType: 'registration_status_change',
  detail: `Status changed from "${previousStatus}" to "${newStatus}"`,
  targetUid: registrationId,   // the registration doc's own ID — audit_log's targetUid is generic enough to describe "the thing acted on," not only a users/{uid}
  targetName: `${student.firstName} ${student.lastName}`,
  performedBy: user.uid,
  performedByName: displayName,
  timestamp: new Date().toISOString(),
  institutionId,
});
```

This gives the full history of every submission's review lifecycle "for free," in the same place every other admin action in this app is already recorded — no new history array or versioning scheme needed on the `enrollmentRegistrations` document itself, which only ever holds *current* state.

### Abuse monitoring

No automated alerting is built for this feature — genuine push-notification-on-spike alerting needs either Cloud Functions (a scheduled function checking recent write volume) or a third-party monitoring integration, neither of which exists in this app today. Two things approximate monitoring without new infrastructure:

- **The review page's own submission count is a passive signal** — an admin who checks in and sees an implausible number of new `pending` entries since they last looked has, in effect, already noticed.
- **The Firebase Console's built-in Usage dashboard** (Firestore → Usage tab) already shows daily read/write/delete counts against the Spark caps, project-wide, with zero setup — the cheapest real detection mechanism available, worth checking periodically during this feature's first weeks live.

### App Check key management

The reCAPTCHA v3 **secret** key never leaves the Google reCAPTCHA / Firebase Console — it is not an environment variable, not committed to the repo, and not handled by this app's code at all. Only the **site key** (public by design, safe to expose) goes into `VITE_FIREBASE_APPCHECK_SITE_KEY`. This mirrors the existing discipline already established for the Firebase service-account key (`scripts/service-account.json`, `.gitignore`-excluded, never committed) — secrets stay in Console/environment, only non-secret identifiers ship in client code.

**If the site key or App Check configuration is ever compromised or needs rotating:** generate a new reCAPTCHA v3 key pair in Google's reCAPTCHA admin console, update the provider configuration in Firebase Console → App Check, update `VITE_FIREBASE_APPCHECK_SITE_KEY`, and redeploy. Existing users don't need to re-authenticate — App Check tokens auto-refresh on their own timer (`isTokenAutoRefreshEnabled: true`, already in the setup snippet) — but there is a brief window during rollout where clients still running the old site key will fail attestation; acceptable given how rarely this should ever need to happen.

### Incident response

Two kill switches, at two different severities:

1. **Scoped to one institution — soft, instant, no special access needed.** Any `institution_admin` flips their own `registration_directory` entry's `acceptingRegistrations` off (§Institution Directory Opt-In). Stops new traffic to that institution's registration form immediately; already-submitted data is untouched.
2. **App-wide — hard, requires a rules redeploy.** If abuse is severe enough to threaten the shared Firestore daily quota (§Firebase Free-Tier Analysis — a large enough spam flood could block writes for the *entire app*, not just registration, for the rest of that day), the fastest full stop is redeploying `firestore.rules` with the `enrollmentRegistrations` `allow create` rule changed to `if false`, following this app's existing rules-deploy process (the `git diff ... | grep '^-'` safety check, then `npm run firebase:deploy:rules`). More severe and less convenient than option 1 — treat as the emergency response, not the default one.

Turning off **App Check enforcement** is explicitly **not** listed as a mitigation for an abuse incident — that would remove this feature's actual defense, making things worse. If App Check enforcement itself is ever suspected of causing an *availability* problem for legitimate users instead (§Firebase App Check → Enforcement scope and blast radius), the response is the opposite: temporarily disable enforcement in Console (Firestore → App Check → un-enforce) to restore access while investigating, accepting the abuse-protection gap as the lesser problem for that window.

---

## Photo Upload — Design (Implementation Deferred)

Still not part of v1 — the second public write surface (Storage, on top of Firestore) is real added risk for a feature this new, and shipping the core flow first lets the App Check/abuse posture prove itself before adding another attack surface. This section exists so that when photo upload *is* built, it doesn't need to be re-derived from scratch.

**Field:** optional, matching the general convention this app already follows for non-essential fields — a family without a photo on hand yet can still complete registration; the admin can request one directly if it matters for a given institution's process.

### Storage path shape

```text
registration_photos/{institutionId}/{registrationId}
```

Scoped by institution, matching every other institution-scoped resource in this app, and keyed by the registration document's own ID so there's a 1:1 correspondence — no separate photo-ID bookkeeping needed.

### Firebase Storage security rules (a separate rules file/language surface from Firestore's)

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /registration_photos/{institutionId}/{registrationId} {
      allow read: if false; // never publicly readable; nothing in v1's admin review UI displays the photo, so there's no reason to open a read path prematurely
      allow create: if request.resource.size <= 5 * 1024 * 1024 // 5MB
        && request.resource.contentType.matches('image/.*');
      allow update, delete: if false; // a resubmission gets a new registrationId, not a photo replacement — keeps this write-once
    }
  }
}
```

**Notes:**

- If a future pass adds a photo preview to the review UI, `allow read` needs to change from `false` to an institution-scoped check (Storage rules can call `get()`/`exists()` against Firestore, the same mechanism Firestore rules use for cross-collection checks, to confirm the requester is that registration's institution's admin).
- Write-once (`update, delete: if false`) avoids a submitter overwriting an already-reviewed submission's photo after the fact.
- App Check enforcement for Storage is a **separate toggle** from Firestore's (Firebase Console → Storage → App Check → Enforce) — both need to be turned on for this to be meaningfully protected; enabling only the Firestore one leaves the photo upload endpoint wide open.

### Data model addition (when implemented)

```diff
  institutions/{institutionId}/enrollmentRegistrations/{registrationId}
    ...
    possibleDuplicate:  boolean
+   photoPath:          string?   // Storage path, set after a successful upload
```

### Write ordering

Upload the photo to Storage **first**, then include the resulting path in the Firestore `create` call — avoids ever referencing a photo that doesn't exist yet, at the cost of a possible orphaned Storage object if the Firestore write fails after a successful upload. No cleanup mechanism is speced for that edge case: an orphaned ≤5MB image is a negligible-cost problem, and cleaning it up automatically would need a Cloud Function trigger, not worth building for this failure mode alone.

---

## Institution Directory Opt-In

A new toggle, added to an existing `institution_admin`-facing settings surface (the natural home is alongside the other institution-level toggles/settings — e.g. `src/scenes/(dashboard)/institution-profile/index.tsx` or `brand-settings/index.tsx`, whichever already owns institution-level configuration; exact placement is an implementation-plan decision, not a design one).

- A single checkbox/switch: "Accept new student registrations."
- On toggle, writes/merges `registration_directory/{institutionId}` with `name`/`logoUrl` denormalized fresh from the real `institutions/{id}` document at that moment (so a stale directory entry only happens if an institution renames itself *without* re-toggling — an accepted minor staleness risk, see §Data Model notes).
- No `super_admin` involvement required for an institution that's already been onboarded.

---

## Login Page Overhaul

### Landing state

`/login` becomes a two-button choice rather than immediately showing the sign-in form:

- **Login** → reveals the existing sign-in form, extended with a new "Institution" dropdown above the email field. Selecting an institution loads its branding (logo, brand color) for the rest of the card — cosmetic only, per §Design Decisions. Leaving it unselected is allowed; the form works exactly as it does today if skipped.
- **Register** → navigates to `/register` (see below), leaving the authenticated app entirely — this is a public route, not behind `Protected`.

### `/register` — institution picker

- Queries `registration_directory` where `acceptingRegistrations == true`.
- A simple searchable list/grid of institution name + logo, matching the visual weight of the existing login card rather than introducing a new design language.
- Empty state: if no institution has opted in, a plain message ("No institutions are currently accepting online registration — please contact your school directly") rather than a broken-looking empty list.

### `/register/:institutionId` — the registration form

- Validates the `institutionId` param against the directory (if it's not present/not accepting registrations, redirect back to `/register` with a message — handles stale bookmarks/links gracefully).
- Loads that institution's branding for the header, matching the existing institution-branding pattern already used throughout the authenticated app (`InstitutionBrand`), even though this route is unauthenticated — read from `registration_directory`, not `institutions/{id}` directly, since only the directory is publicly readable.
- Renders the form itself — see next section.

### `App.tsx` routing

Both new routes are public, following the exact same pattern as the existing `/login` route (outside the `Protected` wrapper, in the `isAuthRoute`-style branch — or a sibling branch alongside it, since `isAuthRoute` today only checks `pathname.startsWith('/login')`; this needs widening to also match `/register`):

```tsx
const isPublicRoute = location.pathname.startsWith("/login") || location.pathname.startsWith("/register");
```

---

## Registration Form Fields

Field shape follows the reference PDF's structure, adapted to this app's naming conventions and validation style (zod + react-hook-form, matching every other form in the app):

| Section | Field | Required | Notes |
|---|---|---|---|
| Student | Last Name | ✅ | |
| Student | First Name | ✅ | |
| Student | Middle Name | — | |
| Student | Requested Class/Grade | ✅ | Free text (see §Data Model note on why this isn't a real `classId`) |
| Student | Date of Birth | ✅ | |
| Student | Gender | ✅ | Select: Male / Female |
| Student | Email | — | Optional — many new students won't have one |
| Student | Last School Attended | — | |
| Mother | Last Name, First Name, Address, Contact, Email, Occupation, Work | At least one guardian section required | Occupation/Work optional within the section |
| Father | Last Name, First Name, Address, Contact, Email, Occupation, Work | At least one guardian section required | Occupation/Work optional within the section |

**Cross-field validation:** at least one of Mother or Father must be fully filled in (all its required sub-fields present) — matches the security rule's own `mother != null || father != null` check, so a submission that would be rejected by the rules never reaches the network in the first place (client-side validation as a UX nicety, the rule as the actual enforcement).

**Not included from the reference form:** the top-level summary "Student Name" field and the separate top-level "Parent/Guardian Email" field (both exist there purely as autofill conveniences for the rest of that vendor's form), and the photo upload (deferred, see §Design Decisions).

### Duplicate Detection

On submit, before writing:

1. Query `institutions/{institutionId}/enrollmentRegistrations` — wait, **this can't be read publicly** (see §Permission Model: read is admin-only). Duplicate detection therefore **cannot** compare against other pending submissions client-side, since the public form has no read access to them.
2. It similarly cannot compare against real `users` (student) records for the same reason.

**Resolution:** duplicate detection happens **at review time, not at submit time** — the `possibleDuplicate` field on each submission is computed by the **admin's** client (which *does* have read access to both other registrations and the institution's students) when the review list loads, not by the submitting visitor's client. The field name/shape in the data model stays as specified; only the *write* trigger point differs from a naive first read of the design decision. Computed as: name (case-insensitive) + date-of-birth exact match against (a) other `enrollmentRegistrations` docs in the same institution/academic year, and (b) existing `users` where `role == 'student'` in that institution. Flagged inline in the review list with a small warning badge — never blocks anything, per §Design Decisions.

This is a correction worth flagging explicitly: the original design-decision framing ("computed client-side against existing students and other pending submissions") is only achievable from the *admin's* side, given the public form's own read restrictions. Noted here so the eventual implementation plan doesn't attempt (and fail) to build it into the public submission flow.

---

## `/dashboard/registrations` — Admin Review Page

New route, `institution_admin`/`super_admin` only (route-level guard, matching the precedent already used for `houses`/`report-card-comments`/other admin-only pages in `App.tsx`).

- A table: Student Name, Requested Class, Date of Birth, Academic Year, Status, Submitted date, a duplicate-warning badge when `possibleDuplicate` is true.
- Filters: Status (All / Pending / Reviewed / Converted / Rejected) and Academic Year — matching the filter-bar pattern already used on `disciplinary-actions/index.tsx`.
- Row click opens a detail view: full submitted data (student + both guardian sections, whichever are present), plus action buttons:
  - **Mark reviewed** — sets `status: 'reviewed'`, `reviewedAt`, `reviewedBy`. No account creation yet.
  - **Convert to accounts** — per §Conversion Flow below.
  - **Reject** — sets `status: 'rejected'`.
  - **Un-reject** — only shown on a `rejected` record; sets `status: 'reviewed'` (not back to `'pending'` — it was reviewed once already, un-rejecting resumes consideration rather than pretending it was never looked at).

  Every one of these four transitions writes a corresponding `institutions/{institutionId}/audit_log` entry (§Operational Security → Audit Log Integration) — the full history of a submission's review lifecycle lives there, not as an array embedded on the registration document itself, matching how every other admin action in this app is already logged.

### Conversion Flow

"Convert to accounts" opens a checklist: **Create student account**, **Create mother's account** (only shown if `mother != null`), **Create father's account** (only shown if `father != null`) — each independently toggleable, defaulting to checked. Confirming:

1. For each checked box, opens `AdminCreateUserForm` (`type="create"`) pre-filled from the corresponding section of the registration document — `firstName`/`lastName`/`dateOfBirth`/`gender` for the student; `firstName`/`lastName`/`email`/`phone` (from `contact`) for a guardian. The admin still sets `password` themselves (this form always requires an admin-chosen temporary password today — unchanged) and picks the real `classId` for the student (the registration only ever had a free-text `requestedClass`).
2. On successful creation of the student account, if any guardian account was also created in this pass, link them via `student_parents` with the appropriate `relationship` (`'mother'`/`'father'`) set automatically — reusing the exact linking write already used by the Student Detail page's "Add parent" flow, just triggered programmatically instead of via the dropdown.
3. Sets `status: 'converted'` and populates whichever of `convertedStudentUid`/`convertedMotherUid`/`convertedFatherUid` correspond to what was actually created in this pass (a partial conversion — e.g. student account created now, guardian account created later in a separate pass — is representable: the doc simply has some `converted*Uid` fields set and others not, with `status` staying `'converted'` once at least the student exists).

This flow deliberately does **not** introduce any new account-creation code path — every account it creates goes through the same `createUserWithEmailAndPassword` + secondary-app pattern `AdminCreateUserForm.tsx` already uses today, just with its initial field values sourced from the registration document instead of typed from scratch.

---

## Student Detail Page Integration (relationship field retrofit)

`src/scenes/(dashboard)/list/students/[id]/index.tsx`'s existing "Add parent" section (parent-link list + dropdown to add another) gets two small additions, since this spec owns the `relationship` field fully (see §Design Decisions):

- The "Add parent" flow prompts for a relationship (`Mother` / `Father` / `Guardian` / `Other`) alongside picking which existing parent account to link — a simple select, defaulting to `Guardian`.
- Each row in the existing `parentLinks` list displays its relationship label (e.g. "Mother — Jane Smith") instead of just the parent's name, when `relationship` is set; falls back to just the name (today's exact current display) when it's unset, for links created before this feature existed.

No other page needs to change — nothing else in the app currently reads or displays `student_parents` data beyond existence checks (`exists()` in security rules, membership checks for scoping queries), which are unaffected by an added field.

---

## `FormModal` Registry

This feature does **not** go through `FormModal.tsx` — registration submission is a standalone public page (not reachable from the authenticated shell `FormModal` lives in), and the review page's actions (mark reviewed / convert / reject) are bespoke buttons on the detail view rather than generic create/update/delete modals, since none of the three map cleanly onto FormModal's `type="create" | "update" | "delete"` model. No `FormModal.tsx` changes are needed for this feature.

---

## Route & Navigation

### `App.tsx`

```tsx
// Public routes (outside Protected), alongside /login:
<Route path="/register" element={<RegistrationInstitutionPickerPage />} />
<Route path="/register/:institutionId" element={<StudentRegistrationFormPage />} />

// Authenticated, admin-only (inside Protected, matching the /dashboard/list/houses guard pattern):
<Route
  path="/dashboard/registrations"
  element={
    role === "institution_admin" || role === "super_admin" ? (
      <RegistrationReviewPage />
    ) : (
      <Navigate to="/dashboard" replace />
    )
  }
/>
```

### `Menu.tsx`

```ts
{
  Icon: ClipboardList, // or UserPlus2 / FileCheck — pick one available in lucide-react
  label: "Registrations",
  href: "/dashboard/registrations",
  visible: ["super_admin", "institution_admin"],
  id: "tour-sidebar-nav-registrations",
},
```

---

## Firebase Free-Tier (Spark) Analysis

Spark's Firestore quotas are **project-wide and shared with every other feature in this app** — this section evaluates this feature's own worst-case marginal contribution against those shared daily caps, the same convention used elsewhere in this codebase's free-tier analyses.

### Firestore

| Spark daily limit | This feature's contribution | Assumptions |
|---|---|---|
| 50,000 reads | ~3–8 reads per submission reviewed (the rules' `academicYearId` existence check adds 1 read per *create*; the admin review list load and duplicate-detection pass add a handful more per review session) | At pilot scale, even a genuinely busy registration day — say 100 submissions across every pilot institution combined — is roughly 500–800 reads, under 2% of the daily cap |
| 20,000 writes | 1 write per submission, plus 1–2 more per admin action (status change, conversion) and 1 `audit_log` write per admin action | 100 submissions + 100 corresponding review actions ≈ 300–500 writes on a very busy day, roughly 2% of the daily cap |
| 20,000 deletes | Only used if an admin manually deletes a converted/rejected submission (§Security Hardening → PII and Data Retention) | Negligible — an occasional manual action, not a per-submission cost |

Even at 10x the assumed "busy day" volume, this feature alone stays comfortably under 20% of any single daily cap. The actual risk isn't this feature's *legitimate* traffic — it's abuse (§Operational Security → Abuse Monitoring): a scripted flood attempting thousands of fake submissions could exhaust the **shared** write quota well before this feature's own honest usage would, and because the quota is shared project-wide, that would also block writes from every other feature in the app — teachers submitting grades, attendance, everything — for the rest of that day. This is the concrete, worst-case reason App Check is in scope for this feature rather than deferred alongside photo upload/email.

### reCAPTCHA v3 (App Check)

Google's reCAPTCHA v3 free tier is separate from Firebase's own quotas entirely — it has historically been free at very high volume (on the order of a million assessments per month per site), far beyond anything a "handful of pilot institutions" scenario would approach. Whoever implements this should confirm the current terms in Google's reCAPTCHA console at implementation time, since third-party quota terms can change independent of this spec.

### Firebase Storage (only relevant once photo upload, §Photo Upload — Design, is actually implemented)

| Spark limit | Assessment |
|---|---|
| 5 GB total stored | At ≤5MB/photo (the cap set in §Photo Upload — Design), roughly 1,000 photos before hitting this — comfortably beyond pilot scale |
| 1 GB/day downloaded | Not exercised at all in v1's design — no read path exists for the photo (`allow read: if false`) |
| 20,000 uploads/day | Same order-of-magnitude reasoning as the Firestore write cap above — legitimate usage is nowhere close; abuse via unauthenticated Storage writes is the real risk, which is exactly why Storage needs its own separate App Check enforcement toggle, not just Firestore's |

---

## Implementation Order (phase-level — a detailed step-by-step plan is a separate future document)

1. Data model + types (`firebase.ts`): `EnrollmentRegistrationDocument`, `RegistrationDirectoryEntry`, `RegistrationStatus`, `ParentRelationship`, shared `StudentParentLink` type.
2. Firestore rules: `registration_directory`, `enrollmentRegistrations` (including the `isValidRegistrationStudent`/`isValidRegistrationGuardian` helper functions and the hardened create/update conditions in §Firestore Security Rules), the `student_parents` update-rule widening. Deploy and verify via the standard `git diff ... firestore.rules` safety check.
3. Firebase App Check: Console registration, env var, `firebase.ts` initialization — **enforcement stays off** in the Console until the rest of this feature is deployed and confirmed live.
4. Institution Directory opt-in toggle (institution-settings page addition).
5. Login page split (Login/Register buttons) + cosmetic Institution dropdown on the existing login form.
6. `/register` institution picker page.
7. `/register/:institutionId` registration form page, including client-side cross-field validation.
8. `/dashboard/registrations` review page: list, filters, detail view, status transitions (including un-reject), with every transition writing the `audit_log` entry from §Operational Security → Audit Log Integration.
9. Duplicate-detection computation on the review page (see §Duplicate Detection correction — this is admin-side, not submit-side).
10. Conversion flow: checklist UI, `AdminCreateUserForm` pre-fill wiring, automatic `student_parents` linking with `relationship`.
11. Student Detail page retrofit: relationship picker on "Add parent," relationship label on existing links.
12. Turn on App Check enforcement in the Console, after confirming the production deploy from steps 1–11 is live (same "confirm live before proceeding" discipline as `CUTOVER_RUNBOOK.md`).

---

## Deferred Items

- **Photo upload** — fully designed (§Photo Upload — Design), implementation still deferred. Requires standing up Storage rules and a *separate* App Check enforcement toggle on top of Firestore's.
- **Email notifications** — confirmation-on-submit, notification-on-conversion. Requires either a third-party client-callable email API or finally introducing Cloud Functions; not discussed further in this spec.
- **Automatic/scheduled data retention enforcement** — v1 relies on an admin manually deleting converted/rejected submissions per their own institution's policy (§Security Hardening → PII and Data Retention). A scheduled auto-purge needs Cloud Functions.
- **Chunked/paginated review list** — v1 assumes registration volume stays low enough for a single `onSnapshot` with client-side filtering, matching the same assumption already made (and already flagged as a scale ceiling) for the Teachers/Students/Parents list pages and the migration scripts elsewhere in this codebase.
- **True server-side rate-limiting** — App Check attests the request came from the real app; it does not by itself cap *how many* submissions one real visitor can send. Explicitly not mitigated client-side either (§Security Hardening → Rate Limiting) — needs Cloud Functions to do properly.
- **Directory staleness** — `registration_directory`'s denormalized `name`/`logoUrl` only refresh when an institution_admin re-toggles the opt-in switch. A background sync (or a Cloud Function trigger, which this whole feature otherwise avoids) is a possible future improvement.
- **Storage read path for photos** — once photo upload ships, if the admin review UI ever needs to *display* the photo (not speced for v1), the Storage rule's `allow read: if false` needs to change to an institution-scoped check, per §Photo Upload — Design.

---

## Issues to Track

- This is the first feature in the codebase with a genuinely public, unauthenticated write path — any future security review of this app should treat `enrollmentRegistrations`' create rule as the highest-scrutiny rule in the whole file, precisely because it's the one exception to "every writer is already authenticated."
- The duplicate-detection correction (§Duplicate Detection) means the `possibleDuplicate` field is written by the *admin's* client during review, not the *visitor's* client during submission, despite the field living on a document the visitor creates. Implementation should set it to `false` at create time (visitor's client has no basis to compute it) and have the review page's read/list logic compute and `update()` it in a pass over freshly-loaded submissions — this needs to be reflected in the `allow update` rule's field-immutability list (`possibleDuplicate` should **not** be locked as immutable the way `student`/`mother`/`father` are).
- `registration_directory` denormalizes institution branding independent of `institutions/{id}`'s own `profileComplete` flag — nothing in this spec stops an institution with an incomplete brand profile from opting into registration and showing a blank/placeholder logo publicly. Worth a product decision later on whether `acceptingRegistrations` should require `profileComplete: true` as a precondition.
- **App Check enforcement is genuinely all-or-nothing for this project's Firestore usage** (§Firebase App Check → Enforcement scope and blast radius) — turning it on protects this feature but also means every existing feature's availability now depends on App Check's own uptime and every user's ability to load Google's reCAPTCHA script. Worth remembering the next time anyone debugs an unrelated "why can't this user save anything" report after this feature ships — check App Check status/enforcement before assuming the bug is in application code.

---

_End of spec._
