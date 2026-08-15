# Student Registration Form — Implementation Plan

> **Status:** Ready to implement — not started
> **Depends on:** `docs/miscellaneous-specs/STUDENT_REGISTRATION_FORM_SPEC.md` (the design spec this plan executes)
> **Scope:** The 12 in-scope phases from the spec's Implementation Order. Photo upload is explicitly excluded — it stays a deferred design reference in the spec only (§Photo Upload — Design), with no plan steps here.
> **Grounded against:** the actual current contents of `firebase.ts`, `firestore.rules`, `paths.ts`, `AuthContext.tsx`, `App.tsx`, `Menu.tsx`, `AdminCreateUserForm.tsx`, `ParentForm.tsx`, `list/students/[id]/index.tsx`, `institution-profile/index.tsx`, and `disciplinary-actions/index.tsx` as of this plan's writing — every code block below is written against what those files actually contain today, not an assumed/idealized version.

---

## How to use this document

Each phase is self-contained: what it builds, the exact files touched, the exact code, and a verification checklist. Work through phases in order — later phases assume earlier ones are merged (e.g. Phase 7's registration form assumes Phase 2's rules and Phase 1's types already exist). After each phase: run `npm run lint`, `npx tsc -b --noEmit`, and `npm test` (the existing suite must stay green — this codebase has no per-component tests, only pure-function unit tests under `src/lib/__tests__/`, so "the suite" means those plus whatever this plan adds to that same directory), then do the manual QA pass listed for that phase before moving on.

---

## Corrections found while planning (read before starting)

Turning the spec's design into real code surfaced three gaps the spec didn't (and couldn't, at design level) resolve. Each is folded into the phase below where it applies, but is called out here up front so a future reader doesn't mistake it for a deviation from the spec — it's a necessary refinement of it.

### 1. The public registration form has no way to read `academicYearId`

The spec's data model requires every submission to carry a real `academicYearId`, validated server-side via `exists(institutions/{institutionId}/academicYears/{id})`. But `institutions/{institutionId}/academicYears` is only readable when `isSignedIn()` — an anonymous visitor's browser cannot query it to find out which year to submit against, and the spec never addressed how the client obtains this value.

**Resolution:** denormalize the institution's _active_ academic year onto `registration_directory/{institutionId}` — the one collection that's already public-readable and already carries denormalized, display-safe fields (`name`, `logoUrl`). Two new fields: `activeAcademicYearId`, `activeAcademicYearName`. Populated by the same institution_admin opt-in toggle that already denormalizes `name`/`logoUrl` (Phase 4), and self-healed on every visit to that toggle so a later change of active year doesn't silently go stale (see Phase 4's "keep-fresh" note). The registration form (Phase 7) reads these two fields directly and never touches `academicYears` at all — consistent with the public form having zero read access to any real nested collection.

### 2. `AdminCreateUserForm` has no prefill mechanism

The spec's Conversion Flow (§`/dashboard/registrations` → Conversion Flow) says "Convert to accounts" opens `AdminCreateUserForm` "pre-filled from the corresponding section of the registration document." But the component as it exists today (`src/components/forms/AdminCreateUserForm.tsx`) only accepts `initialInstitutionId`, `lockedRole`, `initialRole`, and `onSuccess: (userName: string) => void` — there is no prop for seeding `firstName`/`lastName`/`email`/`phone`/`dateOfBirth`/`gender`, and `onSuccess` never surfaces the created Firebase Auth `uid`, which the conversion flow needs to write `student_parents` links.

**Resolution (Phase 10):** two small, additive props/changes to `AdminCreateUserForm.tsx` — an `initialValues` prop that seeds `defaultValues`, and widening `onSuccess` to `(userName: string, uid: string) => void`. This is the same kind of prefill mechanism the component already uses for `initialInstitutionId`/`lockedRole`/`initialRole` — not a new pattern, just extending the existing one to cover the fields the conversion flow needs. The form's actual account-creation mechanics (`createUserWithEmailAndPassword` against the secondary Firebase app) are untouched, preserving the spec's "does not reimplement account creation" guarantee.

### 3. "Row click opens a detail view" — resolved as an in-page panel, not a new route

The spec describes the review page's detail view without specifying whether it's a modal, a drawer, or a separate `/dashboard/registrations/:id` route. This codebase's closest precedent — `list/students/[id]/index.tsx`'s edit panel — uses a `fixed inset-0` modal overlay, not a route, for a similarly-scoped "edit this record" interaction. Phase 8 follows that precedent: the detail view (and the Phase 10 conversion flow inside it) is an in-page modal on `/dashboard/registrations`, not a new dynamic route. This keeps the feature to the one route the spec's own §Route & Navigation section already specifies.

---

## Phase 1 — Data model + types

**Files touched:** `src/lib/firebase.ts` only.

Add these types after `AttendanceSummaryDocument` (the last type before `getRoleLabel`) — i.e. immediately before line 525 (`export function getRoleLabel`):

```ts
export type RegistrationStatus =
  | "pending"
  | "reviewed"
  | "converted"
  | "rejected";

export type ParentRelationship = "mother" | "father" | "guardian" | "other";

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
    gender: "Male" | "Female";
    email?: string;
    lastSchoolAttended?: string;
  };
  mother: RegistrationGuardian | null;
  father: RegistrationGuardian | null;
  convertedStudentUid?: string;
  convertedMotherUid?: string;
  convertedFatherUid?: string;
};

// Denormalized onto registration_directory alongside name/logoUrl — see
// STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md "Corrections found while
// planning" #1 for why the public form needs this instead of reading
// institutions/{id}/academicYears directly (it cannot — that path requires
// isSignedIn()).
export type RegistrationDirectoryEntry = {
  name: string;
  logoUrl?: string;
  acceptingRegistrations: boolean;
  activeAcademicYearId?: string;
  activeAcademicYearName?: string;
  updatedAt: Timestamp | string;
  updatedBy: string;
};

export type StudentParentLink = {
  parentId: string;
  studentId: string;
  institutionId: string;
  relationship?: ParentRelationship;
};
```

### Verification

- `npx tsc -b --noEmit` — must pass with zero errors (these are pure additive type exports; nothing consumes them yet, so there is nothing else to check at this phase).
- No manual QA needed — no UI changes in this phase.

---

## Phase 2 — Firestore rules

**Files touched:** `firestore.rules` only. Deploy via `npm run firebase:deploy:rules` after the standard `git diff firestore.rules` safety check this repo already uses for rules changes — read the diff before deploying, confirm nothing outside this phase's intended additions is included.

### 2a. Two new helper functions

Insert immediately after the closing `}` of `isSeniorTeacherFor()` (current line 110) and before the `// ── Users ──` comment (current line 112) — i.e. as the last item in the `// ── Helpers ──` block:

```javascript
    // Field-shape + size validation for a public, unauthenticated create — this
    // is the actual bypass-resistance for enrollmentRegistrations below, not
    // just a hasAll() presence check. Every free-text field gets an explicit
    // size cap: Firestore's 1MiB per-document limit bounds any single write,
    // but many medium-sized spam documents could still exhaust the shared daily
    // write quota well before any one document approached that limit (see
    // STUDENT_REGISTRATION_FORM_SPEC.md §Firebase Free-Tier (Spark) Analysis) —
    // so size caps matter even though they can't stop submission volume alone.
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

### 2b. `registration_directory` — new top-level collection

Insert immediately after the closing `}` of the `institutions/{institutionId}` block (current lines 667–673), before the `// ── Audit log ──` comment:

```javascript
    // ── Registration Directory (public) ─────────────────────────────────────
    // Anyone may read — this is the whole point, it's what the public
    // registration picker (and the cosmetic Institution dropdown on /login)
    // queries. Only that institution's own admin (or super_admin) may write
    // their institution's entry, and only to their own institutionId — this
    // is a TOP-LEVEL collection, so there is no path segment to validate
    // against the way institutionFieldMatchesPath() does for nested
    // collections; the check compares against the document ID directly.
    match /registration_directory/{institutionId} {
      allow read: if true;
      allow write: if isAdminOrAbove()
        && (isSuperAdmin() || myInstitutionId() == institutionId);
    }
```

### 2c. `enrollmentRegistrations` — new nested collection, the one public write

Insert immediately after the closing `}` of the `institutions/{institutionId}/gradebooks/{gradebookId}` block and its nested `columns` block (current line 1193), before the `// ── Deny everything else ──` comment:

```javascript
    // ── Registration: Enrollment Registrations (public create) ─────────────
    // The one deliberately public write in this entire app. Hardened against
    // the bypass vectors an anonymous caller could actually attempt: a forged
    // academicYearId that doesn't correspond to a real academic year, an
    // out-of-range gender value, wrong-shape guardian objects, planting a
    // fake reviewedAt/reviewedBy/converted*Uid at create time to skip the
    // review workflow entirely, and unbounded string sizes (see the helper
    // functions above). Not part of the §11 nested-collection cutover steps —
    // this collection is brand new, born nested, with no flat legacy sibling.
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
        // "audit trail" posture disciplinaryActions' edit rule already uses.
        // possibleDuplicate is the one deliberate exception: it's computed by
        // the *reviewing admin's* client (Phase 9), not locked immutable like
        // student/mother/father/academicYearId. status moves freely among all
        // four values, including rejected -> reviewed (un-reject, Phase 8) —
        // this is already an admin-only action, so the rule doesn't further
        // constrain which transitions are "valid"; the review page's own UI
        // decides which buttons to show for a given current status.
        && request.resource.data.student == resource.data.student
        && request.resource.data.mother == resource.data.mother
        && request.resource.data.father == resource.data.father
        && request.resource.data.academicYearId == resource.data.academicYearId
        && request.resource.data.status in ['pending', 'reviewed', 'converted', 'rejected'];

      allow delete: if isAdminOrAbove() && inMyInstitution(institutionId);
    }
```

No collection-group read rule is added for `enrollmentRegistrations` (unlike the §11 step 10 group covering 25 legacy collections) — the review page (Phase 8) only ever queries a single institution's own nested path, never across institutions, so there's no genuine cross-institution access need. Add one later only if a real cross-institution use case shows up (matching the exact rationale the step-10 comment in the current rules file already states for why collection-group reads are super_admin-only and purpose-built, not blanket-added).

### 2d. `student_parents` — widen `update` to allow setting `relationship`

The current block (lines 277–284):

```javascript
    match /student_parents/{docId} {
      allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
        || resource.data.studentId == request.auth.uid
        || resource.data.parentId == request.auth.uid;
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      allow update: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }
```

Change only the `allow update` line:

```javascript
    match /student_parents/{docId} {
      allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
        || resource.data.studentId == request.auth.uid
        || resource.data.parentId == request.auth.uid;
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      // Widened only to permit setting `relationship` after the fact (e.g. a
      // link created before this feature existed, now being labeled, or one
      // created during Phase 10's conversion flow) — every other field
      // remains immutable via update, matching the create rule's field set.
      allow update: if isAdminOrAbove()
        && sameInstitution(resource.data.institutionId)
        && request.resource.data.parentId == resource.data.parentId
        && request.resource.data.studentId == resource.data.studentId
        && request.resource.data.institutionId == resource.data.institutionId;
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }
```

### Verification

- Deploy to a non-production project first if one is available; otherwise deploy directly and immediately smoke-test (see below) — this repo has no local rules emulator wired up today (confirmed: no `firebase.json` emulators config referenced by any script in `package.json`), so "deploy and verify live" is the existing pattern (same one `CUTOVER_RUNBOOK.md` uses).
- Manual smoke test after deploy, using the browser console signed out (or an incognito window):
  - `firebase.firestore().collection('registration_directory').get()` should succeed (empty result is fine — nothing has opted in yet).
  - Attempting to read `institutions/{anyId}/enrollmentRegistrations` should fail with `permission-denied`.
- No app code depends on these rules yet — nothing regresses. Existing collections' rules are untouched except the one `student_parents` line, which only narrows what fields an update may touch, so no existing update call in the app (all of which only ever write `parentId`/`studentId`/`institutionId` at create time and never call `updateDoc` on this collection today) can be broken by it — confirmed via a repo-wide search for `student_parents` writes before relying on this claim.

---

## Phase 3 — Firebase App Check

**Files touched:** `src/lib/firebase.ts`, `.env.example`, `.env.development`, `.env.production` (the latter two are gitignored — this phase documents what to add, doesn't script secrets into them).

### 3a. `src/lib/firebase.ts`

Current lines 1–19:

```ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, Timestamp } from "firebase/firestore";

export { Timestamp };

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env
    .VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
```

Replace with:

```ts
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { initializeFirestore, Timestamp } from "firebase/firestore";

export { Timestamp };

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env
    .VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
};

export const app = initializeApp(firebaseConfig);

// Local/CI escape hatch — must run before initializeAppCheck. Only ever set
// in dev; a production build never defines VITE_FIREBASE_APPCHECK_DEBUG_TOKEN,
// so this branch is inert in production. Register the printed token in
// Firebase Console → App Check → Manage debug tokens once, per machine/CI
// runner, after enforcement (Phase 12) is turned on.
if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN) {
  (
    self as typeof self & { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }
  ).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env
    .VITE_FIREBASE_APPCHECK_DEBUG_TOKEN as string;
}

// Guarded: without a configured site key, initializeAppCheck throws. This
// lets a developer without App Check env vars set up keep running the app
// locally against a project with enforcement still off (see Phase 12) —
// enforcement should only flip on in the Console once every environment
// that talks to this project has a working App Check configuration.
if (import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(
      import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY as string,
    ),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
```

`firebase/app-check` ships as part of the already-installed `firebase@^12.15.0` package — no new dependency to add.

### 3b. `.env.example`

Current contents (7 lines, `VITE_FIREBASE_*` config keys). Append:

```text
VITE_FIREBASE_APPCHECK_SITE_KEY="string-of-characters"
VITE_FIREBASE_APPCHECK_DEBUG_TOKEN="string-of-characters, dev/CI only"
```

### 3c. `.env.development` / `.env.production` (manual, not scripted here)

Both are gitignored (confirmed present in the repo but not tracked — same as `scripts/service-account.json`'s handling elsewhere in this codebase). After completing the Console setup steps below, add `VITE_FIREBASE_APPCHECK_SITE_KEY` to both files with the real reCAPTCHA v3 site key, and `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` to `.env.development` only (never production) with a locally-generated debug token.

### 3d. Console setup steps (manual, one-time)

1. Firebase Console → **App Check** → **Register app** → choose **reCAPTCHA v3** for the web app. This produces a **site key** (public, goes in `VITE_FIREBASE_APPCHECK_SITE_KEY`) and a **secret key** (stays in Console — see Phase 3e).
2. Run the app locally once with only the site key set (no debug token yet) — `initializeAppCheck` will log a debug token to the browser console on first load. Copy it into `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` in `.env.development`, then register that same token in Firebase Console → App Check → **Manage debug tokens**.
3. **Do not** turn on enforcement yet — that's Phase 12, after every other phase in this plan is deployed and confirmed live.

### 3e. Key management note

The reCAPTCHA v3 **secret** key never leaves the Google reCAPTCHA / Firebase Console — it is not an environment variable and never touches this repo's code. Only the **site** key (public by design) goes into `VITE_FIREBASE_APPCHECK_SITE_KEY`. This mirrors the existing discipline this repo already applies to `scripts/service-account.json`: secrets stay in Console/environment, only non-secret identifiers ship in client code.

### Verification

- `npx tsc -b --noEmit` and `npm run lint` pass.
- Run `npm run dev`, confirm the app loads and sign-in still works with no App Check errors in the console (enforcement is off, so a missing/invalid token doesn't block anything yet — this step only confirms `initializeAppCheck` doesn't throw).
- Confirm `import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY` is genuinely optional at this point: temporarily unset it and confirm the app still loads (the `if` guard means local dev without App Check configured keeps working, which matters for anyone who checks out this branch before doing the Console setup).

---

## Phase 4 — Institution Directory opt-in toggle

**Files touched:** new `src/components/RegistrationDirectoryToggle.tsx`; `src/scenes/(dashboard)/institution-profile/index.tsx` (mount point).

### 4a. New component

```tsx
// src/components/RegistrationDirectoryToggle.tsx
import { useEffect, useState } from "react";
import {
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection } from "@/lib/paths";
import type { RegistrationDirectoryEntry } from "@/lib/firebase";

type ActiveYear = { id: string; name: string };

export default function RegistrationDirectoryToggle() {
  const { user, institutionId, institution } = useAuth();
  const [activeYear, setActiveYear] = useState<ActiveYear | null>(null);
  const [checkingYear, setCheckingYear] = useState(true);
  const [entry, setEntry] = useState<RegistrationDirectoryEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Find the institution's current active academic year — this is the
  // signed-in admin's own read, fully permitted by the existing
  // institutions/{id}/academicYears rule (isSignedIn() && inMyInstitution()).
  useEffect(() => {
    if (!institutionId || institutionId === "*") return;
    setCheckingYear(true);
    getDocs(
      query(
        institutionCollection(institutionId, "academicYears"),
        where("status", "==", "active"),
      ),
    ).then((snap) => {
      const d = snap.docs[0];
      setActiveYear(
        d ? { id: d.id, name: (d.data().name as string) ?? d.id } : null,
      );
      setCheckingYear(false);
    });
  }, [institutionId]);

  // Load the current directory entry, if one exists.
  useEffect(() => {
    if (!institutionId || institutionId === "*") return;
    getDoc(doc(db, "registration_directory", institutionId)).then((snap) => {
      setEntry(
        snap.exists() ? (snap.data() as RegistrationDirectoryEntry) : null,
      );
    });
  }, [institutionId]);

  // Keep-fresh: if the directory is already accepting registrations and the
  // active year has since changed (or the institution's name/logo changed),
  // silently re-sync on every visit to this settings section — closes the
  // staleness gap noted in this plan's "Corrections found while planning" #1
  // without needing a Cloud Function trigger.
  useEffect(() => {
    if (!institutionId || institutionId === "*" || !user || !institution)
      return;
    if (!entry?.acceptingRegistrations || !activeYear) return;
    const stale =
      entry.activeAcademicYearId !== activeYear.id ||
      entry.name !== institution.name ||
      entry.logoUrl !== (institution.logoUrl ?? undefined);
    if (!stale) return;
    setDoc(
      doc(db, "registration_directory", institutionId),
      {
        name: institution.name,
        logoUrl: institution.logoUrl ?? null,
        acceptingRegistrations: true,
        activeAcademicYearId: activeYear.id,
        activeAcademicYearName: activeYear.name,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      },
      { merge: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, activeYear, institution, institutionId, user]);

  const toggle = async (next: boolean) => {
    if (!institutionId || institutionId === "*" || !user) return;
    setError(null);
    if (next && !activeYear) {
      setError(
        "Set an active academic year on the Academic Calendar page before accepting registrations.",
      );
      return;
    }
    setSaving(true);
    try {
      await setDoc(
        doc(db, "registration_directory", institutionId),
        {
          name: institution?.name ?? "",
          logoUrl: institution?.logoUrl ?? null,
          acceptingRegistrations: next,
          ...(next && activeYear
            ? {
                activeAcademicYearId: activeYear.id,
                activeAcademicYearName: activeYear.name,
              }
            : {}),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true },
      );
      setEntry((prev) => ({
        ...(prev ?? ({} as RegistrationDirectoryEntry)),
        acceptingRegistrations: next,
      }));
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 sm:p-6 mt-4">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
        Student Registration
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        When enabled, your institution appears on the public registration page
        and prospective families can submit a registration form for review.
      </p>

      <label className="flex items-center gap-3 mt-4 cursor-pointer">
        <input
          type="checkbox"
          checked={entry?.acceptingRegistrations ?? false}
          disabled={saving || checkingYear}
          onChange={(e) => toggle(e.target.checked)}
          className="accent-sky-500 w-4 h-4"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Accept new student registrations
        </span>
      </label>

      {!checkingYear && !activeYear && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          No active academic year found. Set one on the Academic Calendar page
          first.
        </p>
      )}
      {activeYear && (
        <p className="mt-2 text-xs text-gray-400">
          Registrations will be filed under {activeYear.name}.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
```

### 4b. Mount point

In `src/scenes/(dashboard)/institution-profile/index.tsx`, the `InstitutionProfilePage` entry point currently has three branches: non-admin (`InstitutionInfoDisplay`), admin-with-complete-profile, admin-with-incomplete-profile (the wizard). Add the toggle to the admin-with-complete-profile branch, since the directory's denormalized `name`/`logoUrl` should come from a finished profile. Current lines 810–836:

```tsx
const InstitutionProfilePage = () => {
  const { role, institution } = useAuth();

  if (role !== "institution_admin") {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <InstitutionInfoDisplay />
      </div>
    );
  }

  if (institution?.profileComplete) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-semibold text-center text-gray-900 dark:text-gray-100 mb-4">
          Institution Profile
        </h1>
        <InstitutionInfoDisplay />
        <p className="mt-4 text-center text-sm text-gray-400 dark:text-gray-500">
          Please contact the service administrator to edit your institution's
          profile data.
        </p>
      </div>
    );
  }

  return <InstitutionProfileWizard />;
};

export default InstitutionProfilePage;
```

Add the import at the top of the file and the toggle in the completed-profile branch:

```diff
 import { useState, useEffect } from 'react';
 import { doc, getDoc, updateDoc } from 'firebase/firestore';
 import { z } from 'zod';
 import { db } from '@/lib/firebase';
 import { useAuth } from '@/lib/AuthContext';
 import { formatPhone } from '@/lib/phone';
+import RegistrationDirectoryToggle from '@/components/RegistrationDirectoryToggle';
 import type { AuthorizedSignature, GradingSystem } from '@/lib/firebase';
```

```diff
   if (institution?.profileComplete) {
     return (
-      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
+      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4 w-full">
         <h1 className="text-2xl font-semibold text-center text-gray-900 dark:text-gray-100 mb-4">
           Institution Profile
         </h1>
         <InstitutionInfoDisplay />
         <p className="mt-4 text-center text-sm text-gray-400 dark:text-gray-500">
           Please contact the service administrator to edit your institution's profile data.
         </p>
+        <div className="w-full max-w-xl">
+          <RegistrationDirectoryToggle />
+        </div>
       </div>
     );
   }
```

### Verification

- `npx tsc -b --noEmit`, `npm run lint`.
- Manual QA (dev server, signed in as an `institution_admin` on an institution with `profileComplete: true`):
  - With no active academic year set: checkbox is disabled-by-message (attempting to check it shows the amber warning and does not write).
  - Set an active academic year on Academic Calendar, return to Institution Profile: checkbox is now checkable; checking it writes `registration_directory/{institutionId}` (verify in Firebase Console) with `acceptingRegistrations: true` and the correct `activeAcademicYearId`/`Name`.
  - Unchecking it writes `acceptingRegistrations: false`; the document is not deleted.
  - Change the active academic year, revisit the page with the toggle already on: confirm the directory doc's `activeAcademicYearId`/`Name` silently update to the new year (the keep-fresh effect).

---

## Phase 5 — Login page split

**Files touched:** `src/scenes/(auth)/login/index.tsx`; `src/App.tsx` (widen the public-route check).

### 5a. `App.tsx` — widen `isAuthRoute`

Current line 94:

```tsx
const isAuthRoute = location.pathname.startsWith("/login");
```

Change to:

```tsx
const isAuthRoute =
  location.pathname.startsWith("/login") ||
  location.pathname.startsWith("/register");
```

The `isAuthRoute` branch (current lines 113–130) renders its own `<Routes>` with only `/login` registered. Phase 6/7 add the two `/register*` routes into this same branch — this step only widens the boolean gate so those routes (once added) don't fall through to the authenticated `<Routes>` tree below, where they'd hit the `Protected` wrapper and redirect to `/login`.

### 5b. `src/scenes/(auth)/login/index.tsx` — chooser + Institution dropdown

The current file is a single-view sign-in form (247 lines, reproduced in full in this plan's grounding pass). Restructure into a chooser view and a login view, with the Institution dropdown added to the login view only. Full replacement:

```tsx
import { FormEvent, useEffect, useState } from "react";
import { FirebaseError } from "firebase/app";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { RegistrationDirectoryEntry } from "@/lib/firebase";
import { Eye, EyeOff, Mail, Lock, LogIn, UserPlus } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type DirectoryOption = { id: string } & RegistrationDirectoryEntry;

function ChoiceView({
  onChooseLogin,
  onChooseRegister,
}: {
  onChooseLogin: () => void;
  onChooseRegister: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="relative z-10 w-full max-w-105 animate-login-card">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl px-8 py-10 sm:px-10">
          <div className="flex justify-center mb-7">
            <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
              <img
                src="/logo.png"
                alt="School logo"
                className="w-12 h-12 object-contain"
              />
            </div>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 leading-tight mb-1.5">
              Welcome
            </h1>
            <p className="text-slate-500 text-sm">
              Sign in to an existing account, or register as a new student
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onChooseLogin}
              className="w-full py-2.5 rounded-lg font-semibold text-white text-sm tracking-wide bg-slate-900 hover:bg-slate-800 active:scale-[0.985] shadow-sm flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" /> Login
            </button>
            <button
              type="button"
              onClick={onChooseRegister}
              className="w-full py-2.5 rounded-lg font-semibold text-slate-700 text-sm tracking-wide bg-white border border-slate-300 hover:bg-slate-50 active:scale-[0.985] flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" /> Register
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginFormView({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);

  // Cosmetic pre-selection only — signIn() takes no institution parameter;
  // the institution is derived server-side from users/{uid} after auth (see
  // STUDENT_REGISTRATION_FORM_SPEC.md §Design Decisions). Selecting an entry
  // here only swaps the card's logo/brand accent before sign-in.
  const [institutions, setInstitutions] = useState<DirectoryOption[]>([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");

  useEffect(() => {
    getDocs(
      query(
        collection(db, "registration_directory"),
        where("acceptingRegistrations", "==", true),
      ),
    ).then((snap) =>
      setInstitutions(
        snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as RegistrationDirectoryEntry),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    );
  }, []);

  const selectedInstitution = institutions.find(
    (i) => i.id === selectedInstitutionId,
  );

  const validateEmail = (value: string): string | undefined => {
    if (!value.trim()) return "Email is required.";
    if (!EMAIL_RE.test(value.trim()))
      return "Please enter a valid email address.";
    return undefined;
  };

  const validatePassword = (value: string): string | undefined => {
    if (!value) return "Password is required.";
    return undefined;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const emailErr = validateEmail(email);
    const passErr = validatePassword(password);
    if (emailErr || passErr) {
      setFieldErrors({ email: emailErr, password: passErr });
      return;
    }
    setFieldErrors({});
    setGlobalError(null);
    setLoading(true);
    const { error: authError } = await signIn(email, password);
    if (authError) {
      const code =
        authError instanceof FirebaseError ? authError.code : undefined;
      if (code === "auth/user-disabled") {
        setGlobalError(
          "This account has been disabled. Contact your administrator.",
        );
      } else if (code === "auth/network-request-failed") {
        setGlobalError("Network error. Check your connection and try again.");
      } else if (code === "auth/invalid-email") {
        setFieldErrors({ email: "Please enter a valid email address." });
        setFailedAttempts((n) => n + 1);
      } else {
        setFieldErrors({ password: "Incorrect password. Please try again." });
        setFailedAttempts((n) => n + 1);
      }
      setLoading(false);
    } else {
      navigate("/dashboard", { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="relative z-10 w-full max-w-105 animate-login-card">
        <div
          className="bg-white rounded-2xl border border-slate-200 shadow-xl px-8 py-10 sm:px-10"
          style={selectedInstitution?.logoUrl ? undefined : undefined}
        >
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-slate-400 hover:text-slate-600 mb-4"
          >
            ← Back
          </button>

          <div className="flex justify-center mb-7">
            <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
              <img
                src={selectedInstitution?.logoUrl || "/logo.png"}
                alt="School logo"
                className="w-12 h-12 object-contain"
              />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 leading-tight mb-1.5">
              Welcome back
            </h1>
            <p className="text-slate-500 text-sm">Sign in to the Portal</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {institutions.length > 0 && (
              <div>
                <label
                  className="block text-sm font-semibold text-slate-700 mb-1.5"
                  htmlFor="institution"
                >
                  Institution{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <select
                  id="institution"
                  value={selectedInstitutionId}
                  onChange={(e) => setSelectedInstitutionId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 text-sm outline-none bg-slate-50 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/8"
                >
                  <option value="">Select for branding only</option>
                  {institutions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label
                className="block text-sm font-semibold text-slate-700 mb-1.5"
                htmlFor="email"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  className={`w-full pl-9 pr-4 py-2.5 rounded-lg border text-slate-900 text-sm placeholder:text-slate-400 outline-none transition-all bg-slate-50 ${
                    fieldErrors.email
                      ? "border-red-400 focus:ring-2 focus:ring-red-200"
                      : "border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/8"
                  }`}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email)
                      setFieldErrors((p) => ({ ...p, email: undefined }));
                  }}
                  onBlur={() =>
                    setFieldErrors((p) => ({
                      ...p,
                      email: validateEmail(email),
                    }))
                  }
                  autoComplete="email"
                />
              </div>
              {fieldErrors.email && (
                <p className="mt-1.5 text-xs text-red-500">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  className="block text-sm font-semibold text-slate-700"
                  htmlFor="password"
                >
                  Password
                </label>
                <span className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors cursor-default select-none">
                  Forgot password?
                </span>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className={`w-full pl-9 pr-10 py-2.5 rounded-lg border text-slate-900 text-sm placeholder:text-slate-400 outline-none transition-all bg-slate-50 ${
                    fieldErrors.password
                      ? "border-red-400 focus:ring-2 focus:ring-red-200"
                      : "border-slate-200 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/8"
                  }`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password)
                      setFieldErrors((p) => ({ ...p, password: undefined }));
                  }}
                  onBlur={() =>
                    setFieldErrors((p) => ({
                      ...p,
                      password: validatePassword(password),
                    }))
                  }
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {fieldErrors.password && (
                <p className="mt-1.5 text-xs text-red-500">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {globalError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                <p className="text-sm text-red-700">{globalError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 rounded-lg font-semibold text-white text-sm tracking-wide transition-all duration-150 ${
                loading
                  ? "bg-slate-400 cursor-not-allowed"
                  : "bg-slate-900 hover:bg-slate-800 active:scale-[0.985] shadow-sm"
              }`}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          {failedAttempts >= 3 && (
            <p className="mt-5 text-xs text-center text-slate-500">
              Forgot password? Contact your administrator.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [view, setView] = useState<"choice" | "login">("choice");
  const navigate = useNavigate();

  if (view === "login") {
    return <LoginFormView onBack={() => setView("choice")} />;
  }
  return (
    <ChoiceView
      onChooseLogin={() => setView("login")}
      onChooseRegister={() => navigate("/register")}
    />
  );
}
```

Note on the spinner markup dropped from the original: the original file's loading state rendered an inline `<svg>` spinner inside the submit button; this rewrite keeps the same disabled/label behavior (`"Signing in…"` vs `"Sign In"`) but drops the spinner glyph for brevity in this plan's listing — when actually implementing, either keep the original `<svg>...</svg>` block verbatim (copy it from the current file, unchanged) or accept the plain-text loading state. This is a cosmetic detail, not a logic difference, and doesn't affect any of this feature's design decisions — call it out during code review rather than deciding it silently in this plan.

### Verification

- `npx tsc -b --noEmit`, `npm run lint`.
- Manual QA:
  - `/login` shows the two-button chooser, not the sign-in form.
  - "Login" reveals the sign-in form; existing credentials still sign in successfully and land on `/dashboard`.
  - With at least one institution opted in (Phase 4 QA), the Institution dropdown appears and lists it; selecting it swaps the card logo; leaving it unselected still signs in normally (confirms the "cosmetic only, skippable" design decision).
  - "Register" navigates to `/register` (404/blank until Phase 6 adds the route — expected at this point in the plan).
  - "← Back" returns to the chooser.

---

## Phase 6 — `/register` institution picker page

**Files touched:** new `src/scenes/(auth)/register/index.tsx`; `src/App.tsx` (register the route).

### 6a. New page

```tsx
// src/scenes/(auth)/register/index.tsx
import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "@/lib/firebase";
import type { RegistrationDirectoryEntry } from "@/lib/firebase";
import { Search } from "lucide-react";

type DirectoryOption = { id: string } & RegistrationDirectoryEntry;

export default function RegistrationInstitutionPickerPage() {
  const [institutions, setInstitutions] = useState<DirectoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getDocs(
      query(
        collection(db, "registration_directory"),
        where("acceptingRegistrations", "==", true),
      ),
    )
      .then((snap) =>
        setInstitutions(
          snap.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as RegistrationDirectoryEntry),
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const filtered = institutions.filter((i) =>
    i.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl px-8 py-10 sm:px-10">
          <h1 className="text-2xl font-bold text-slate-900 text-center mb-1.5">
            Register
          </h1>
          <p className="text-slate-500 text-sm text-center mb-6">
            Select the institution you'd like to register for.
          </p>

          {institutions.length > 3 && (
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search institutions…"
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 text-sm outline-none bg-slate-50 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/8"
              />
            </div>
          )}

          {loading ? (
            <p className="text-center text-sm text-slate-400 py-8">Loading…</p>
          ) : institutions.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">
              No institutions are currently accepting online registration —
              please contact your school directly.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">
              No institutions match "{search}".
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {filtered.map((i) => (
                <li key={i.id}>
                  <Link
                    to={`/register/${i.id}`}
                    className="flex items-center gap-3 py-3 px-1 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                      <img
                        src={i.logoUrl || "/logo.png"}
                        alt=""
                        className="w-7 h-7 object-contain"
                      />
                    </div>
                    <span className="text-sm font-medium text-slate-800">
                      {i.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 6b. `App.tsx` — register the route

In the `isAuthRoute` branch (current lines 113–130), add the import and route:

```diff
 import LoginPage from "@/scenes/(auth)/login";
+import RegistrationInstitutionPickerPage from "@/scenes/(auth)/register";
```

```diff
   if (isAuthRoute) {
     return (
       <Suspense fallback={<h1>Loading...</h1>}>
         <Routes>
           <Route
             path="/login"
             element={
               !loading && user ? (
                 <Navigate to="/dashboard" replace />
               ) : (
                 <LoginPage />
               )
             }
           />
+          <Route path="/register" element={<RegistrationInstitutionPickerPage />} />
         </Routes>
       </Suspense>
     );
   }
```

(Phase 7 adds the second `/register/:institutionId` route into this same block.)

### Verification

- `npx tsc -b --noEmit`, `npm run lint`.
- Manual QA: navigate to `/register` directly (no sign-in) — page loads, shows the empty state if nothing's opted in yet, or lists the institution from Phase 4's QA pass. Search filters correctly. Clicking an institution navigates to `/register/{id}` (blank/404 until Phase 7).

---

## Phase 7 — `/register/:institutionId` registration form page

**Files touched:** new `src/scenes/(auth)/register/[institutionId]/index.tsx`; `src/App.tsx` (register the second route).

### 7a. New page

This is the feature's core public write. Cross-field validation (at least one guardian) is implemented via two "Add mother's information" / "Add father's information" checkboxes rather than inferring completeness from partial fill — this avoids the ambiguity of a half-filled guardian section and matches the rules' own all-or-nothing `RegistrationGuardian` shape exactly.

```tsx
// src/scenes/(auth)/register/[institutionId]/index.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { addDoc, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { RegistrationDirectoryEntry } from "@/lib/firebase";
import { institutionCollection } from "@/lib/paths";

const guardianSchema = z.object({
  lastName: z.string().min(1, "Last name is required.").max(100),
  firstName: z.string().min(1, "First name is required.").max(100),
  address: z.string().min(1, "Address is required.").max(300),
  contact: z.string().min(1, "Contact number is required.").max(50),
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Enter a valid email address.")
    .max(254),
  occupation: z.string().max(100).optional().or(z.literal("")),
  work: z.string().max(100).optional().or(z.literal("")),
});

const schema = z
  .object({
    student: z.object({
      lastName: z.string().min(1, "Last name is required.").max(100),
      firstName: z.string().min(1, "First name is required.").max(100),
      middleName: z.string().max(100).optional().or(z.literal("")),
      requestedClass: z
        .string()
        .min(1, "Requested class/grade is required.")
        .max(50),
      dateOfBirth: z.string().min(1, "Date of birth is required."),
      gender: z.enum(["Male", "Female"], {
        message: "Please select a gender.",
      }),
      email: z
        .string()
        .email("Enter a valid email address.")
        .max(254)
        .optional()
        .or(z.literal("")),
      lastSchoolAttended: z.string().max(200).optional().or(z.literal("")),
    }),
    includeMother: z.boolean(),
    includeFather: z.boolean(),
    mother: guardianSchema.optional(),
    father: guardianSchema.optional(),
  })
  .superRefine((values, ctx) => {
    if (!values.includeMother && !values.includeFather) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["includeMother"],
        message: "Provide at least one parent/guardian's information.",
      });
    }
    if (values.includeMother && !values.mother) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mother"],
        message: "Mother's information is required.",
      });
    }
    if (values.includeFather && !values.father) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["father"],
        message: "Father's information is required.",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

const inputClass =
  "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100";
const labelClass =
  "flex flex-col gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-500">{message}</p>;
}

function GuardianFields({
  prefix,
  register,
  errors,
}: {
  prefix: "mother" | "father";
  register: ReturnType<typeof useForm<FormValues>>["register"];
  errors: ReturnType<typeof useForm<FormValues>>["formState"]["errors"];
}) {
  const err = errors[prefix];
  return (
    <div className="grid gap-4 sm:grid-cols-2 mt-3 pl-4 border-l-2 border-sky-100 dark:border-sky-900">
      <label className={labelClass}>
        Last name
        <input {...register(`${prefix}.lastName`)} className={inputClass} />
        <FieldError message={err?.lastName?.message} />
      </label>
      <label className={labelClass}>
        First name
        <input {...register(`${prefix}.firstName`)} className={inputClass} />
        <FieldError message={err?.firstName?.message} />
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Address
        <input {...register(`${prefix}.address`)} className={inputClass} />
        <FieldError message={err?.address?.message} />
      </label>
      <label className={labelClass}>
        Contact number
        <input {...register(`${prefix}.contact`)} className={inputClass} />
        <FieldError message={err?.contact?.message} />
      </label>
      <label className={labelClass}>
        Email
        <input
          type="email"
          {...register(`${prefix}.email`)}
          className={inputClass}
        />
        <FieldError message={err?.email?.message} />
      </label>
      <label className={labelClass}>
        Occupation <span className="font-normal text-gray-400">(optional)</span>
        <input {...register(`${prefix}.occupation`)} className={inputClass} />
      </label>
      <label className={labelClass}>
        Employer <span className="font-normal text-gray-400">(optional)</span>
        <input {...register(`${prefix}.work`)} className={inputClass} />
      </label>
    </div>
  );
}

export default function StudentRegistrationFormPage() {
  const { institutionId } = useParams<{ institutionId: string }>();
  const navigate = useNavigate();
  const [directory, setDirectory] = useState<
    (RegistrationDirectoryEntry & { id: string }) | null | undefined
  >(undefined);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!institutionId) return;
    getDoc(doc(db, "registration_directory", institutionId)).then((snap) => {
      if (
        !snap.exists() ||
        !(snap.data() as RegistrationDirectoryEntry).acceptingRegistrations
      ) {
        setDirectory(null);
        return;
      }
      setDirectory({
        id: institutionId,
        ...(snap.data() as RegistrationDirectoryEntry),
      });
    });
  }, [institutionId]);

  useEffect(() => {
    if (directory === null) {
      navigate("/register", {
        replace: true,
        state: {
          message: "That institution isn't accepting registrations right now.",
        },
      });
    }
  }, [directory, navigate]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      student: {
        lastName: "",
        firstName: "",
        middleName: "",
        requestedClass: "",
        dateOfBirth: "",
        gender: undefined,
        email: "",
        lastSchoolAttended: "",
      },
      includeMother: false,
      includeFather: false,
    },
  });

  const includeMother = watch("includeMother");
  const includeFather = watch("includeFather");

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    if (!directory?.activeAcademicYearId || !institutionId) {
      setSubmitError(
        "This institution hasn't set an active academic year yet. Please contact them directly.",
      );
      return;
    }
    try {
      await addDoc(
        institutionCollection(institutionId, "enrollmentRegistrations"),
        {
          institutionId,
          academicYearId: directory.activeAcademicYearId,
          academicYearName: directory.activeAcademicYearName ?? "",
          status: "pending",
          submittedAt: serverTimestamp(),
          possibleDuplicate: false, // computed by the reviewing admin's client, not here — see Phase 9
          student: {
            lastName: values.student.lastName,
            firstName: values.student.firstName,
            ...(values.student.middleName && {
              middleName: values.student.middleName,
            }),
            requestedClass: values.student.requestedClass,
            dateOfBirth: values.student.dateOfBirth,
            gender: values.student.gender,
            ...(values.student.email && { email: values.student.email }),
            ...(values.student.lastSchoolAttended && {
              lastSchoolAttended: values.student.lastSchoolAttended,
            }),
          },
          mother: values.includeMother && values.mother ? values.mother : null,
          father: values.includeFather && values.father ? values.father : null,
        },
      );
      setSubmitted(true);
    } catch {
      setSubmitError(
        "Something went wrong submitting your registration. Please try again.",
      );
    }
  });

  if (directory === undefined) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center text-sm text-slate-400">
        Loading…
      </div>
    );
  }
  if (!directory) return null; // redirect effect above handles navigation

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl px-8 py-10 max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            Registration received
          </h1>
          <p className="text-sm text-slate-500">
            Thank you — {directory.name} has received your registration and will
            be in touch.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block text-xs text-sky-600 hover:underline"
          >
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-xl px-8 py-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
            <img
              src={directory.logoUrl || "/logo.png"}
              alt=""
              className="w-8 h-8 object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {directory.name}
            </h1>
            <p className="text-xs text-slate-500">
              Student Registration — {directory.activeAcademicYearName}
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
          <section>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              Student Information
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Last name
                <input
                  {...register("student.lastName")}
                  className={inputClass}
                />
                <FieldError message={errors.student?.lastName?.message} />
              </label>
              <label className={labelClass}>
                First name
                <input
                  {...register("student.firstName")}
                  className={inputClass}
                />
                <FieldError message={errors.student?.firstName?.message} />
              </label>
              <label className={labelClass}>
                Middle name{" "}
                <span className="font-normal text-gray-400">(optional)</span>
                <input
                  {...register("student.middleName")}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                Requested class/grade
                <input
                  {...register("student.requestedClass")}
                  className={inputClass}
                />
                <FieldError message={errors.student?.requestedClass?.message} />
              </label>
              <label className={labelClass}>
                Date of birth
                <input
                  type="date"
                  {...register("student.dateOfBirth")}
                  className={inputClass}
                />
                <FieldError message={errors.student?.dateOfBirth?.message} />
              </label>
              <label className={labelClass}>
                Gender
                <select {...register("student.gender")} className={inputClass}>
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <FieldError message={errors.student?.gender?.message} />
              </label>
              <label className={labelClass}>
                Email{" "}
                <span className="font-normal text-gray-400">(optional)</span>
                <input
                  type="email"
                  {...register("student.email")}
                  className={inputClass}
                />
                <FieldError message={errors.student?.email?.message} />
              </label>
              <label className={labelClass}>
                Last school attended{" "}
                <span className="font-normal text-gray-400">(optional)</span>
                <input
                  {...register("student.lastSchoolAttended")}
                  className={inputClass}
                />
              </label>
            </div>
          </section>

          <section>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register("includeMother")}
                className="accent-sky-500 w-4 h-4"
              />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Add mother's information
              </span>
            </label>
            {includeMother && (
              <GuardianFields
                prefix="mother"
                register={register}
                errors={errors}
              />
            )}
          </section>

          <section>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register("includeFather")}
                className="accent-sky-500 w-4 h-4"
              />
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Add father's information
              </span>
            </label>
            {includeFather && (
              <GuardianFields
                prefix="father"
                register={register}
                errors={errors}
              />
            )}
          </section>

          <FieldError message={errors.includeMother?.message} />

          {submitError && <p className="text-sm text-red-500">{submitError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-sky-500 text-white py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {isSubmitting ? "Submitting…" : "Submit Registration"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

### 7b. `App.tsx` — register the second route

```diff
 import LoginPage from "@/scenes/(auth)/login";
 import RegistrationInstitutionPickerPage from "@/scenes/(auth)/register";
+import StudentRegistrationFormPage from "@/scenes/(auth)/register/[institutionId]";
```

```diff
           <Route path="/register" element={<RegistrationInstitutionPickerPage />} />
+          <Route path="/register/:institutionId" element={<StudentRegistrationFormPage />} />
```

### Verification

- `npx tsc -b --noEmit`, `npm run lint`.
- Manual QA:
  - Visiting `/register/{a-non-opted-in-id}` (or a nonexistent ID) redirects back to `/register`.
  - Visiting `/register/{the-opted-in-id}` from Phase 4/6 QA loads the form with the institution's name/logo/academic year.
  - Submitting with neither guardian checkbox checked shows the "at least one" error and does not submit.
  - Submitting with only Mother checked and required mother fields filled succeeds; confirm in Firebase Console that the new `enrollmentRegistrations` doc has `mother: {...}`, `father: null`, `status: 'pending'`, `possibleDuplicate: false`, and the correct `academicYearId`.
  - Submitting with an invalid guardian email, or a guardian address exceeding 300 characters, is caught client-side by Zod before any network call.
  - Confirm the create is rejected server-side if you manually attempt (e.g. via browser console) to plant `reviewedAt` or `convertedStudentUid` on the create payload — the Phase 2c rule should deny it.

---

## Phase 8 — `/dashboard/registrations` review page

**Files touched:** new `src/scenes/(dashboard)/registrations/index.tsx`; `src/App.tsx` (authenticated route); `src/components/Menu.tsx` (nav item).

### 8a. New page

Table + status/year filters follow the `disciplinary-actions/index.tsx` precedent (search input, filter-button row, `Table`/`Pagination` components). The detail view is an in-page modal (Corrections #3). The "Convert to accounts" button opens the Phase 10 panel — stubbed here as `ConvertToAccountsPanel`, built out in full in Phase 10.

```tsx
// src/scenes/(dashboard)/registrations/index.tsx
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  EnrollmentRegistrationDocument,
  RegistrationStatus,
} from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import {
  institutionCollection,
  institutionDoc,
  institutionSubcollection,
} from "@/lib/paths";
import { computePossibleDuplicates } from "@/lib/registrationDuplicates";
import Table from "@/components/Table";
import Pagination from "@/components/Pagination";
import { PAGE_SIZE } from "@/lib/utils";
import { addDoc } from "firebase/firestore";
import ConvertToAccountsPanel from "./ConvertToAccountsPanel";

type Registration = EnrollmentRegistrationDocument & { id: string };

const STATUS_FILTERS: Array<RegistrationStatus | "all"> = [
  "all",
  "pending",
  "reviewed",
  "converted",
  "rejected",
];

const STATUS_BADGE_CLS: Record<RegistrationStatus, string> = {
  pending:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  reviewed: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  converted:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const columns = [
  { header: "Student", accessor: "student" },
  {
    header: "Requested Class",
    accessor: "requestedClass",
    className: "hidden md:table-cell",
  },
  {
    header: "Date of Birth",
    accessor: "dob",
    className: "hidden md:table-cell",
  },
  {
    header: "Academic Year",
    accessor: "academicYearName",
    className: "hidden md:table-cell",
  },
  { header: "Status", accessor: "status" },
  {
    header: "Submitted",
    accessor: "submittedAt",
    className: "hidden md:table-cell",
  },
];

function formatDate(iso: string) {
  return iso
    ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";
}

async function logAudit(
  institutionId: string,
  registrationId: string,
  studentName: string,
  previousStatus: string,
  newStatus: string,
  performedBy: string,
  performedByName: string,
) {
  await addDoc(
    institutionSubcollection(
      institutionId,
      "institutions",
      institutionId,
      "audit_log",
    ),
    {
      eventType: "registration_status_change",
      detail: `Status changed from "${previousStatus}" to "${newStatus}"`,
      targetUid: registrationId,
      targetName: studentName,
      performedBy,
      performedByName,
      timestamp: new Date().toISOString(),
      institutionId,
    },
  );
}

export default function RegistrationReviewPage() {
  const { user, displayName, institutionId } = useAuth();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<RegistrationStatus | "all">(
    "all",
  );
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Registration | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);

  useEffect(() => {
    if (!institutionId || institutionId === "*") return;
    const unsub = onSnapshot(
      institutionCollection(institutionId, "enrollmentRegistrations"),
      (snap) => {
        setRegistrations(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as EnrollmentRegistrationDocument),
          })),
        );
        setLoading(false);
      },
    );
    return unsub;
  }, [institutionId]);

  // Duplicate-detection pass: admin-side only (see spec's Duplicate Detection
  // correction, and this plan's Phase 9). Runs once per fresh registrations
  // snapshot, using getDocs (not onSnapshot) against students, to avoid a
  // write-triggers-read-triggers-write loop.
  useEffect(() => {
    if (!institutionId || institutionId === "*" || registrations.length === 0)
      return;
    let cancelled = false;
    getDocs(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "student"),
      ),
    ).then((snap) => {
      if (cancelled) return;
      const existingStudents = snap.docs.map((d) => ({
        firstName: (d.data().firstName as string) ?? "",
        lastName: (d.data().lastName as string) ?? "",
        dateOfBirth: (d.data().dateOfBirth as string) ?? "",
      }));
      const updates = computePossibleDuplicates(
        registrations,
        existingStudents,
      );
      updates.forEach(({ id, possibleDuplicate }) => {
        updateDoc(
          institutionDoc(institutionId, "enrollmentRegistrations", id),
          { possibleDuplicate },
        ).catch(() => {});
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId, registrations.length]);

  const years = useMemo(
    () =>
      Array.from(new Set(registrations.map((r) => r.academicYearName))).sort(),
    [registrations],
  );

  const filtered = useMemo(() => {
    let data = registrations;
    if (statusFilter !== "all")
      data = data.filter((r) => r.status === statusFilter);
    if (yearFilter !== "all")
      data = data.filter((r) => r.academicYearName === yearFilter);
    return [...data].sort((a, b) =>
      String(b.submittedAt).localeCompare(String(a.submittedAt)),
    );
  }, [registrations, statusFilter, yearFilter]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const transition = async (
    reg: Registration,
    newStatus: RegistrationStatus,
  ) => {
    if (!institutionId || institutionId === "*" || !user) return;
    await updateDoc(
      institutionDoc(institutionId, "enrollmentRegistrations", reg.id),
      {
        status: newStatus,
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid,
      },
    );
    await logAudit(
      institutionId,
      reg.id,
      `${reg.student.firstName} ${reg.student.lastName}`,
      reg.status,
      newStatus,
      user.uid,
      displayName ?? "",
    );
    setSelected(null);
  };

  const renderRow = (item: Registration) => (
    <tr
      key={item.id}
      onClick={() => setSelected(item)}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm hover:bg-lamaPurpleLight dark:hover:bg-gray-800 cursor-pointer"
    >
      <td className="flex items-center gap-2 p-4">
        {item.student.firstName} {item.student.lastName}
        {item.possibleDuplicate && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            possible duplicate
          </span>
        )}
      </td>
      <td className="hidden md:table-cell">{item.student.requestedClass}</td>
      <td className="hidden md:table-cell">
        {formatDate(item.student.dateOfBirth)}
      </td>
      <td className="hidden md:table-cell">{item.academicYearName}</td>
      <td>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLS[item.status]}`}
        >
          {item.status}
        </span>
      </td>
      <td className="hidden md:table-cell">{String(item.submittedAt)}</td>
    </tr>
  );

  if (institutionId === "*") {
    return (
      <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
        <h1 className="text-lg font-semibold mb-4">Registrations</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Select an institution to view registrations.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md flex-1 m-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="hidden md:block text-lg font-semibold">Registrations</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                statusFilter === s
                  ? "bg-sky-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
              }`}
            >
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        {years.length > 1 && (
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm bg-white dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        )}
      </div>

      <Table
        columns={columns}
        renderRow={renderRow}
        data={paginated}
        loading={loading}
      />
      <Pagination
        total={filtered.length}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />

      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-lg flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">
              {selected.student.firstName} {selected.student.lastName}
            </h2>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-500">Requested Class</dt>
              <dd>{selected.student.requestedClass}</dd>
              <dt className="text-gray-500">Date of Birth</dt>
              <dd>{formatDate(selected.student.dateOfBirth)}</dd>
              <dt className="text-gray-500">Gender</dt>
              <dd>{selected.student.gender}</dd>
              <dt className="text-gray-500">Academic Year</dt>
              <dd>{selected.academicYearName}</dd>
            </dl>

            {selected.mother && (
              <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                <h3 className="text-sm font-semibold mb-1">Mother</h3>
                <p className="text-sm">
                  {selected.mother.firstName} {selected.mother.lastName} —{" "}
                  {selected.mother.contact} — {selected.mother.email}
                </p>
                <p className="text-xs text-gray-400">
                  {selected.mother.address}
                </p>
              </div>
            )}
            {selected.father && (
              <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                <h3 className="text-sm font-semibold mb-1">Father</h3>
                <p className="text-sm">
                  {selected.father.firstName} {selected.father.lastName} —{" "}
                  {selected.father.contact} — {selected.father.email}
                </p>
                <p className="text-xs text-gray-400">
                  {selected.father.address}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-end pt-3 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
              >
                Close
              </button>
              {selected.status === "pending" && (
                <button
                  onClick={() => transition(selected, "reviewed")}
                  className="px-4 py-2 rounded-md bg-sky-600 text-white text-sm"
                >
                  Mark reviewed
                </button>
              )}
              {selected.status !== "converted" &&
                selected.status !== "rejected" && (
                  <button
                    onClick={() => setConvertOpen(true)}
                    className="px-4 py-2 rounded-md bg-green-600 text-white text-sm"
                  >
                    Convert to accounts
                  </button>
                )}
              {selected.status !== "rejected" &&
                selected.status !== "converted" && (
                  <button
                    onClick={() => transition(selected, "rejected")}
                    className="px-4 py-2 rounded-md bg-red-600 text-white text-sm"
                  >
                    Reject
                  </button>
                )}
              {selected.status === "rejected" && (
                <button
                  onClick={() => transition(selected, "reviewed")}
                  className="px-4 py-2 rounded-md bg-sky-600 text-white text-sm"
                >
                  Un-reject
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {convertOpen && selected && institutionId && institutionId !== "*" && (
        <ConvertToAccountsPanel
          registration={selected}
          institutionId={institutionId}
          onClose={() => setConvertOpen(false)}
          onConverted={() => {
            setConvertOpen(false);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
```

### 8b. `App.tsx` — authenticated route

Add the import near the other dashboard imports, and a route in the authenticated `<Routes>` tree (current lines 61–62, and 271–273 for the sibling `disciplinary-actions` pattern to copy):

```diff
 import DisciplinaryActionsPage from "@/scenes/(dashboard)/disciplinary-actions";
+import RegistrationReviewPage from "@/scenes/(dashboard)/registrations";
```

```diff
                 <Route
                   path="/dashboard/disciplinary-actions"
                   element={<DisciplinaryActionsPage />}
                 />
+                <Route
+                  path="/dashboard/registrations"
+                  element={
+                    role === "institution_admin" || role === "super_admin" ? (
+                      <RegistrationReviewPage />
+                    ) : (
+                      <Navigate to="/dashboard" replace />
+                    )
+                  }
+                />
```

### 8c. `Menu.tsx` — nav item

Add to the `"PEOPLE"` section (current lines 78–124), after "Parents" — registrations are prospective people, closer kin to that section than to "OUTCOMES":

```diff
   {
     title: "PEOPLE",
     items: [
       { /* Create User */ },
       { /* Teachers */ },
       { /* Students */ },
       { /* Parents */ },
+      {
+        Icon: UserPlus2,
+        label: "Registrations",
+        href: "/dashboard/registrations",
+        visible: ["super_admin", "institution_admin"],
+        id: "tour-sidebar-nav-registrations",
+      },
     ],
   },
```

(the three placeholder items above are the existing Create User/Teachers/Students/Parents entries — unchanged, shown collapsed here for brevity; only the new entry is added, after `Parents`, before the section's closing `],`.) Add `UserPlus2` to the `lucide-react` import list at the top of the file (it isn't currently imported — every other icon used in `menuItems` already is).

### Verification

- `npx tsc -b --noEmit`, `npm run lint`.
- Manual QA (signed in as `institution_admin`):
  - "Registrations" appears in the sidebar under People; navigating to it loads the table.
  - The Phase 7 QA submission appears as a `pending` row, with a duplicate badge if a same-name/DOB student already exists (test this once Phase 9 is also in place — see that phase's QA).
  - Status/year filters work. Clicking a row opens the detail modal with both guardian sections rendered (or just one, per what was submitted).
  - "Mark reviewed" transitions `pending → reviewed` and writes an `audit_log` entry (check Firebase Console `institutions/{id}/audit_log`).
  - "Reject" transitions to `rejected`; the button set changes to show "Un-reject" only.
  - "Un-reject" returns status to `reviewed`, not `pending`.
  - Signed in as `senior_teacher`/`regular_teacher`/`student`/`parent`: `/dashboard/registrations` redirects to `/dashboard`, and the sidebar item is absent.

---

## Phase 9 — Duplicate-detection computation

**Files touched:** new `src/lib/registrationDuplicates.ts`; new `src/lib/__tests__/registrationDuplicates.test.ts`. (The call site inside `RegistrationReviewPage` was already written in Phase 8a — this phase fills in the pure logic it calls.)

Matches this codebase's existing convention of unit-testing pure `src/lib/*.ts` functions (`reportCardUtils.ts`, `reportBuilder.ts`, `gradeEntryTracking.ts` all have siblings under `src/lib/__tests__/`) rather than testing components.

### 9a. `src/lib/registrationDuplicates.ts`

```ts
// Admin-side duplicate detection for enrollment registrations. The public
// registration form cannot compute this itself — it has no read access to
// other registrations or to existing students (see
// STUDENT_REGISTRATION_FORM_SPEC.md's Duplicate Detection correction) — so
// this runs against data only the reviewing admin's client can read.
import type { EnrollmentRegistrationDocument } from "./firebase";

type MinimalStudent = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
};

function normalizeName(first: string, last: string): string {
  return `${first.trim().toLowerCase()} ${last.trim().toLowerCase()}`;
}

function isMatch(a: MinimalStudent, b: MinimalStudent): boolean {
  return (
    normalizeName(a.firstName, a.lastName) ===
      normalizeName(b.firstName, b.lastName) && a.dateOfBirth === b.dateOfBirth
  );
}

/**
 * For each registration, determines whether it name+DOB-matches another
 * pending/reviewed registration in the same set, or an existing student.
 * Returns only the entries whose computed value differs from what's
 * currently stored, so the caller only writes what actually changed.
 */
export function computePossibleDuplicates(
  registrations: (EnrollmentRegistrationDocument & { id: string })[],
  existingStudents: MinimalStudent[],
): { id: string; possibleDuplicate: boolean }[] {
  const updates: { id: string; possibleDuplicate: boolean }[] = [];

  registrations.forEach((reg, i) => {
    const self: MinimalStudent = {
      firstName: reg.student.firstName,
      lastName: reg.student.lastName,
      dateOfBirth: reg.student.dateOfBirth,
    };

    const matchesOtherRegistration = registrations.some((other, j) => {
      if (i === j) return false;
      if (other.academicYearName !== reg.academicYearName) return false;
      return isMatch(self, {
        firstName: other.student.firstName,
        lastName: other.student.lastName,
        dateOfBirth: other.student.dateOfBirth,
      });
    });

    const matchesExistingStudent = existingStudents.some((s) =>
      isMatch(self, s),
    );

    const computed = matchesOtherRegistration || matchesExistingStudent;
    if (computed !== reg.possibleDuplicate) {
      updates.push({ id: reg.id, possibleDuplicate: computed });
    }
  });

  return updates;
}
```

### 9b. `src/lib/__tests__/registrationDuplicates.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { computePossibleDuplicates } from "../registrationDuplicates";

function reg(
  overrides: Partial<{
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    academicYearName: string;
    possibleDuplicate: boolean;
  }>,
) {
  return {
    id: overrides.id ?? "r1",
    institutionId: "inst1",
    academicYearId: "y1",
    academicYearName: overrides.academicYearName ?? "2026-2027",
    status: "pending" as const,
    submittedAt: "2026-01-01T00:00:00.000Z",
    possibleDuplicate: overrides.possibleDuplicate ?? false,
    student: {
      lastName: overrides.lastName ?? "Smith",
      firstName: overrides.firstName ?? "Jane",
      requestedClass: "Grade 7",
      dateOfBirth: overrides.dateOfBirth ?? "2015-05-01",
      gender: "Female" as const,
    },
    mother: null,
    father: null,
  };
}

describe("computePossibleDuplicates", () => {
  it("flags no duplicates when nothing matches", () => {
    const result = computePossibleDuplicates([reg({ id: "r1" })], []);
    expect(result).toEqual([]);
  });

  it("flags two registrations with the same name and DOB in the same year", () => {
    const regs = [reg({ id: "r1" }), reg({ id: "r2" })];
    const result = computePossibleDuplicates(regs, []);
    expect(result).toEqual(
      expect.arrayContaining([
        { id: "r1", possibleDuplicate: true },
        { id: "r2", possibleDuplicate: true },
      ]),
    );
  });

  it("is case-insensitive on name matching", () => {
    const regs = [
      reg({ id: "r1", firstName: "jane", lastName: "SMITH" }),
      reg({ id: "r2", firstName: "Jane", lastName: "Smith" }),
    ];
    const result = computePossibleDuplicates(regs, []);
    expect(result.map((u) => u.id).sort()).toEqual(["r1", "r2"]);
  });

  it("does not flag same name with different academic years", () => {
    const regs = [
      reg({ id: "r1", academicYearName: "2025-2026" }),
      reg({ id: "r2", academicYearName: "2026-2027" }),
    ];
    expect(computePossibleDuplicates(regs, [])).toEqual([]);
  });

  it("flags a match against an existing student", () => {
    const result = computePossibleDuplicates(
      [reg({ id: "r1" })],
      [{ firstName: "Jane", lastName: "Smith", dateOfBirth: "2015-05-01" }],
    );
    expect(result).toEqual([{ id: "r1", possibleDuplicate: true }]);
  });

  it("does not re-emit an update when the computed value already matches stored state", () => {
    const result = computePossibleDuplicates(
      [reg({ id: "r1", possibleDuplicate: true })],
      [{ firstName: "Jane", lastName: "Smith", dateOfBirth: "2015-05-01" }],
    );
    expect(result).toEqual([]);
  });
});
```

### Verification

- `npm test` — new suite passes alongside the existing `reportCardUtils`/`reportBuilder`/`gradeEntryTracking` tests.
- `npx tsc -b --noEmit`, `npm run lint`.
- Manual QA (continuing from Phase 8's QA): submit two Phase 7 registrations with the same name and date of birth for the same institution/academic year; reload `/dashboard/registrations`; confirm both rows show the "possible duplicate" badge and that `enrollmentRegistrations/{id}.possibleDuplicate` is `true` in Firebase Console. Reject one, confirm the badge computation still runs correctly (rejected registrations still participate in matching, per this implementation — no status filter in `computePossibleDuplicates`, matching the spec's "flag surfaces a warning" framing without carving out an exception it never mentioned).

---

## Phase 10 — Conversion flow

**Files touched:** `src/components/forms/AdminCreateUserForm.tsx` (additive prop changes, Corrections #2); new `src/scenes/(dashboard)/registrations/ConvertToAccountsPanel.tsx`.

### 10a. `AdminCreateUserForm.tsx` — additive prefill support

Current props type (lines 139–145):

```ts
type AdminCreateUserFormProps = {
  initialInstitutionId?: string;
  lockedRole?: Role;
  initialRole?: Role;
  onSuccess?: (userName: string) => void;
};
```

Change to:

```ts
type AdminCreateUserFormProps = {
  initialInstitutionId?: string;
  lockedRole?: Role;
  initialRole?: Role;
  // Additive prefill for the conversion flow (Phase 10 of
  // STUDENT_REGISTRATION_FORM_IMPLEMENTATION_PLAN.md) — seeds defaultValues
  // the same way initialInstitutionId/lockedRole/initialRole already do.
  // Every other field keeps its normal blank default when omitted.
  initialValues?: Partial<
    Pick<
      FormValues,
      | "firstName"
      | "lastName"
      | "email"
      | "phone"
      | "dateOfBirth"
      | "gender"
      | "institutionStudentId"
    >
  >;
  // Widened from (userName: string) => void — the conversion flow needs the
  // created Firebase Auth uid to link student_parents afterward.
  onSuccess?: (userName: string, uid: string) => void;
};
```

Current `defaultValues` construction (lines 165–180):

```ts
const defaultValues: FormValues = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
  phone: "",
  role:
    lockedRole ??
    initialRole ??
    (role === "super_admin" ? "institution_admin" : "senior_teacher"),
  institutionId: initialInstitutionId ?? "",
  departmentId: "",
  classId: "",
  assignedClassId: "",
  dateOfBirth: "",
  institutionStudentId: "",
  gender: undefined,
};
```

Change to:

```ts
const defaultValues: FormValues = {
  firstName: initialValues?.firstName ?? "",
  lastName: initialValues?.lastName ?? "",
  email: initialValues?.email ?? "",
  password: "",
  confirmPassword: "",
  phone: initialValues?.phone ?? "",
  role:
    lockedRole ??
    initialRole ??
    (role === "super_admin" ? "institution_admin" : "senior_teacher"),
  institutionId: initialInstitutionId ?? "",
  departmentId: "",
  classId: "",
  assignedClassId: "",
  dateOfBirth: initialValues?.dateOfBirth ?? "",
  institutionStudentId: initialValues?.institutionStudentId ?? "",
  gender: initialValues?.gender,
};
```

And the function signature (line 146–151) gains the new destructured prop:

```ts
export default function AdminCreateUserForm({
  initialInstitutionId,
  lockedRole,
  initialRole,
  initialValues,
  onSuccess,
}: AdminCreateUserFormProps = {}) {
```

Finally, the two call sites of `onSuccess` (in the success branch, current lines 390–396) pass the new second argument:

```diff
     const createdName = [values.firstName, values.lastName].join(' ');
     if (onSuccess) {
-      onSuccess(createdName);
+      onSuccess(createdName, createdUser.uid);
     } else {
       setSuccess(`${createdName} was created successfully.`);
       reset(defaultValues);
     }
```

`react-hook-form`'s `useForm({ defaultValues })` only reads its initial value once per mount — since `AdminCreateUserForm` is freshly mounted per conversion step (Phase 10b renders one at a time, keyed per step), this is sufficient; no `reset()`-on-prop-change handling is needed.

Every other existing call site of `AdminCreateUserForm` (`create-user` pages) omits `initialValues` and keeps the old one-argument `onSuccess` usage pattern working unchanged, since the new parameter is additive and optional.

### 10b. `ConvertToAccountsPanel.tsx`

A stepper: one checked account type at a time, confirming before moving to the next, then a final write that links `student_parents` and updates the registration document.

```tsx
// src/scenes/(dashboard)/registrations/ConvertToAccountsPanel.tsx
import { useState } from "react";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { EnrollmentRegistrationDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionDoc, institutionSubcollection } from "@/lib/paths";
import AdminCreateUserForm from "@/components/forms/AdminCreateUserForm";
import { addDoc } from "firebase/firestore";

type Registration = EnrollmentRegistrationDocument & { id: string };
type StepKind = "student" | "mother" | "father";

async function logAudit(
  institutionId: string,
  registrationId: string,
  studentName: string,
  detail: string,
  performedBy: string,
  performedByName: string,
) {
  await addDoc(
    institutionSubcollection(
      institutionId,
      "institutions",
      institutionId,
      "audit_log",
    ),
    {
      eventType: "registration_status_change",
      detail,
      targetUid: registrationId,
      targetName: studentName,
      performedBy,
      performedByName,
      timestamp: new Date().toISOString(),
      institutionId,
    },
  );
}

export default function ConvertToAccountsPanel({
  registration,
  institutionId,
  onClose,
  onConverted,
}: {
  registration: Registration;
  institutionId: string;
  onClose: () => void;
  onConverted: () => void;
}) {
  const { user, displayName } = useAuth();
  const [checked, setChecked] = useState<Record<StepKind, boolean>>({
    student: !registration.convertedStudentUid,
    mother: !!registration.mother && !registration.convertedMotherUid,
    father: !!registration.father && !registration.convertedFatherUid,
  });
  const [started, setStarted] = useState(false);
  const [uids, setUids] = useState<Partial<Record<StepKind, string>>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const steps: StepKind[] = (
    ["student", "mother", "father"] as StepKind[]
  ).filter((k) => checked[k]);
  const currentStep = steps[stepIndex];

  const finish = async (finalUids: Partial<Record<StepKind, string>>) => {
    setFinishing(true);
    const studentUid = finalUids.student ?? registration.convertedStudentUid;
    if (studentUid) {
      if (finalUids.mother) {
        await setDoc(
          doc(db, "student_parents", `${finalUids.mother}_${studentUid}`),
          {
            parentId: finalUids.mother,
            studentId: studentUid,
            institutionId,
            relationship: "mother",
            createdAt: serverTimestamp(),
            createdBy: user?.uid ?? "",
          },
        );
      }
      if (finalUids.father) {
        await setDoc(
          doc(db, "student_parents", `${finalUids.father}_${studentUid}`),
          {
            parentId: finalUids.father,
            studentId: studentUid,
            institutionId,
            relationship: "father",
            createdAt: serverTimestamp(),
            createdBy: user?.uid ?? "",
          },
        );
      }
    }

    await updateDoc(
      institutionDoc(institutionId, "enrollmentRegistrations", registration.id),
      {
        status: "converted",
        ...(finalUids.student && { convertedStudentUid: finalUids.student }),
        ...(finalUids.mother && { convertedMotherUid: finalUids.mother }),
        ...(finalUids.father && { convertedFatherUid: finalUids.father }),
      },
    );

    if (user) {
      await logAudit(
        institutionId,
        registration.id,
        `${registration.student.firstName} ${registration.student.lastName}`,
        `Status changed from "${registration.status}" to "converted"`,
        user.uid,
        displayName ?? "",
      );
    }

    setFinishing(false);
    onConverted();
  };

  const handleStepSuccess =
    (kind: StepKind) => (_name: string, uid: string) => {
      const nextUids = { ...uids, [kind]: uid };
      setUids(nextUids);
      if (stepIndex + 1 < steps.length) {
        setStepIndex((i) => i + 1);
      } else {
        finish(nextUids);
      }
    };

  if (!started) {
    return (
      <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-md w-full max-w-md flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Convert to accounts</h2>
          <p className="text-sm text-gray-500">
            Choose which accounts to create for this registration.
          </p>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={checked.student}
              disabled={!!registration.convertedStudentUid}
              onChange={(e) =>
                setChecked((c) => ({ ...c, student: e.target.checked }))
              }
              className="accent-sky-500"
            />
            <span className="text-sm">
              Create student account
              {registration.convertedStudentUid && (
                <span className="text-gray-400"> (already created)</span>
              )}
            </span>
          </label>
          {registration.mother && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checked.mother}
                disabled={!!registration.convertedMotherUid}
                onChange={(e) =>
                  setChecked((c) => ({ ...c, mother: e.target.checked }))
                }
                className="accent-sky-500"
              />
              <span className="text-sm">
                Create mother's account
                {registration.convertedMotherUid && (
                  <span className="text-gray-400"> (already created)</span>
                )}
              </span>
            </label>
          )}
          {registration.father && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={checked.father}
                disabled={!!registration.convertedFatherUid}
                onChange={(e) =>
                  setChecked((c) => ({ ...c, father: e.target.checked }))
                }
                className="accent-sky-500"
              />
              <span className="text-sm">
                Create father's account
                {registration.convertedFatherUid && (
                  <span className="text-gray-400"> (already created)</span>
                )}
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={() => (steps.length > 0 ? setStarted(true) : finish({}))}
              disabled={!checked.student && !checked.mother && !checked.father}
              className="px-4 py-2 rounded-md bg-green-600 text-white text-sm disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (finishing || !currentStep) {
    return (
      <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-md text-sm text-gray-500">
          Finishing conversion…
        </div>
      </div>
    );
  }

  const guardianData =
    currentStep === "mother"
      ? registration.mother
      : currentStep === "father"
        ? registration.father
        : null;

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-md w-full max-w-3xl my-8">
        <div className="px-6 pt-6 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            Step {stepIndex + 1} of {steps.length}: create {currentStep} account
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
        <AdminCreateUserForm
          initialInstitutionId={institutionId}
          lockedRole={currentStep === "student" ? "student" : "parent"}
          initialValues={
            currentStep === "student"
              ? {
                  firstName: registration.student.firstName,
                  lastName: registration.student.lastName,
                  dateOfBirth: registration.student.dateOfBirth,
                  gender: registration.student.gender,
                }
              : guardianData
                ? {
                    firstName: guardianData.firstName,
                    lastName: guardianData.lastName,
                    email: guardianData.email,
                    phone: guardianData.contact,
                  }
                : undefined
          }
          onSuccess={handleStepSuccess(currentStep)}
        />
      </div>
    </div>
  );
}
```

Note: `AdminCreateUserForm` currently only accepts `lockedRole` from the `Role` union (`'institution_admin' | 'senior_teacher' | 'regular_teacher' | 'student' | 'parent' | 'super_admin'`), so `lockedRole="student"` and `lockedRole="parent"` are both valid without further change.

### Verification

- `npx tsc -b --noEmit`, `npm run lint`.
- Manual QA: from the Phase 8 detail modal, click "Convert to accounts" on a registration with both guardian sections present.
  - Check all three boxes, Continue: the student step's `AdminCreateUserForm` shows firstName/lastName/dateOfBirth/gender pre-filled (still editable), role locked to Student, class dropdown available for manual selection, temporary password left blank for the admin to set. Complete it.
  - Confirm the flow automatically advances to the mother step, pre-filled from `registration.mother`, role locked to Parent. Complete it, then the father step the same way.
  - After the last step: confirm in Firebase Console that `student_parents` now has two new docs (`{motherUid}_{studentUid}`, `{fatherUid}_{studentUid}`) each with the correct `relationship`, that `enrollmentRegistrations/{id}` now has `status: 'converted'` and all three `converted*Uid` fields set, and that a new `audit_log` entry was written.
  - Re-open the same (now-converted) registration's detail view: confirm "Convert to accounts" no longer appears (status is `converted`).
  - Test a partial conversion: on a different registration, check only "Create student account," complete it, confirm `status` becomes `converted` with only `convertedStudentUid` set and the other two `converted*Uid` fields absent — matches the spec's "partial conversion is representable" design decision.

---

## Phase 11 — Student Detail page retrofit

**Files touched:** `src/scenes/(dashboard)/list/students/[id]/index.tsx` only.

### 11a. Track and submit `relationship`

Add state and update `handleLinkParent` (current lines 108–116 for state, 189–207 for the handler):

```diff
   // Parent linking state
   const [parentLinks, setParentLinks] = useState<
-    { docId: string; parentId: string }[]
+    { docId: string; parentId: string; relationship?: ParentRelationship }[]
   >([]);
   const [allParents, setAllParents] = useState<
     { uid: string; name: string; email?: string }[]
   >([]);
   const [selectedParentId, setSelectedParentId] = useState("");
+  const [selectedRelationship, setSelectedRelationship] = useState<ParentRelationship>("guardian");
   const [linkingParent, setLinkingParent] = useState(false);
   const [linkError, setLinkError] = useState<string | null>(null);
```

Add the `ParentRelationship` import alongside the existing type imports (current lines 17–21):

```diff
 import type {
   UserDocument,
   DisciplinaryActionDocument,
   DisciplinaryActionType,
+  ParentRelationship,
 } from "@/lib/firebase";
```

Update the parent-links `onSnapshot` mapping (current lines 152–165) to read `relationship`:

```diff
   useEffect(() => {
     if (!id) return;
     return onSnapshot(
       query(collection(db, "student_parents"), where("studentId", "==", id)),
       (snap) =>
         setParentLinks(
           snap.docs.map((d) => ({
             docId: d.id,
             parentId: d.data().parentId as string,
+            relationship: d.data().relationship as ParentRelationship | undefined,
           })),
         ),
     );
   }, [id]);
```

Update `handleLinkParent` (current lines 189–207) to write `relationship` and reset the selector on success:

```diff
   const handleLinkParent = async () => {
     if (!id || !selectedParentId || !user || !institutionId) return;
     setLinkingParent(true);
     setLinkError(null);
     try {
       await setDoc(doc(db, "student_parents", `${selectedParentId}_${id}`), {
         parentId: selectedParentId,
         studentId: id,
         institutionId,
+        relationship: selectedRelationship,
         createdAt: serverTimestamp(),
         createdBy: user.uid,
       });
       setSelectedParentId("");
+      setSelectedRelationship("guardian");
     } catch {
       setLinkError("Failed to link parent. Please try again.");
     } finally {
       setLinkingParent(false);
     }
   };
```

### 11b. Display relationship label; add the picker to "Add parent"

Update the parent-links list item (current lines 617–630) to show the relationship when set:

```diff
                 return (
                   <li
                     key={link.docId}
                     className="flex items-center justify-between py-2 text-sm"
                   >
                     <div>
                       <span className="text-gray-900 dark:text-gray-100 font-medium">
-                        {parent?.name ?? link.parentId}
+                        {link.relationship
+                          ? `${link.relationship.charAt(0).toUpperCase()}${link.relationship.slice(1)} — ${parent?.name ?? link.parentId}`
+                          : (parent?.name ?? link.parentId)}
                       </span>
```

Update the "Add parent" row (current lines 649–673) to include the relationship select next to the parent picker:

```diff
             <div className="flex gap-2 items-center pt-1">
+              <select
+                value={selectedRelationship}
+                onChange={(e) => setSelectedRelationship(e.target.value as ParentRelationship)}
+                className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400"
+              >
+                <option value="mother">Mother</option>
+                <option value="father">Father</option>
+                <option value="guardian">Guardian</option>
+                <option value="other">Other</option>
+              </select>
               <select
                 value={selectedParentId}
                 onChange={(e) => setSelectedParentId(e.target.value)}
                 className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-sky-400"
               >
```

### Verification

- `npx tsc -b --noEmit`, `npm run lint`.
- Manual QA: on any student's detail page (as `institution_admin`), link a parent with relationship "Mother" — confirm the list row now reads "Mother — {name}". Link a second parent as "Father" — confirm both rows display correctly. Confirm a pre-existing link created before this phase (no `relationship` field) still displays as just the name, unaffected. Confirm the Phase 10 conversion flow's automatically-created links (relationship `mother`/`father`, Phase 10 QA) also display correctly here.

---

## Phase 12 — Turn on App Check enforcement

**Files touched:** none — Console-only, deploy-gated.

This is the final step, only after Phases 1–11 are merged and deployed, and the live production build actually has `VITE_FIREBASE_APPCHECK_SITE_KEY` wired up (confirm by checking the deployed site's network requests for the reCAPTCHA v3 script, or by checking Vercel's environment variables include the key).

1. Confirm the production deploy is live and confirmed working (same "confirm live before proceeding" discipline `CUTOVER_RUNBOOK.md` already established) — sign in as a real user, load a few authenticated pages, confirm no errors.
2. Firebase Console → **App Check** → confirm the web app shows recent, real attestation traffic (not just debug-token traffic) — this is what tells you production is actually presenting valid tokens, not just that the code compiled.
3. Firebase Console → **Firestore Database** → **App Check** tab → **Enforce**.
4. Immediately re-test: sign in as a real user in production, confirm reads/writes still work (Menu navigation, opening a list page). If anything breaks, the rollback is Console-only and immediate — un-enforce (see `STUDENT_REGISTRATION_FORM_SPEC.md` §Operational Security → Incident Response) — no code deploy needed either way.
5. Test the actual target of this whole phase: from an incognito window with no Firebase debug token, confirm `/register` and the registration form still work end-to-end (App Check should be transparent to a real browser running the real app — this only blocks scripted/non-browser access).

### Verification

- No `tsc`/`eslint`/`vitest` checks apply — this phase has no code.
- Manual QA is the checklist above, performed directly against production. Do this during low-traffic hours given the "every existing authenticated read/write in the app now depends on App Check" blast radius called out in the spec.

---

_End of plan._
