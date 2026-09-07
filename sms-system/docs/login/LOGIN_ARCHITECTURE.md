# Login — Architecture & Reference

> **Status:** Current / as-built. This document describes the login system as it
> exists in the code today, and is written to stand on its own.
>
> **Date documented:** 2026-09-07

## Table of Contents

1. [User-Facing Flow](#1-user-facing-flow)
2. [Component Architecture](#2-component-architecture)
3. [The Institution-Match Mechanism](#3-the-institution-match-mechanism)
4. [AuthContext — Auth State Resolution](#4-authcontext--auth-state-resolution)
5. [Institution Data Sources](#5-institution-data-sources)
6. [Institution Creation & Directory Seeding](#6-institution-creation--directory-seeding)
7. [Firebase — Collections & Document Shapes](#7-firebase--collections--document-shapes)
8. [Firebase — Security Rules](#8-firebase--security-rules)
9. [Firebase — Indexes](#9-firebase--indexes)
10. [Routing](#10-routing)
11. [File Reference](#11-file-reference)
12. [Testing](#12-testing)
13. [Known Limitations / Risks](#13-known-limitations--risks)
14. [Manual QA Checklist](#14-manual-qa-checklist)
15. [Implementation History](#15-implementation-history)

---

## 1. User-Facing Flow

1. Visiting `/login` shows a **choice screen** (`ChoiceView`): "Login" or
   "Register." Register goes to the separate, unrelated `/register` flow
   (a public institution picker + student self-registration form) — see
   [§10](#10-routing) for how the two routes coexist.
2. Choosing "Login" shows the **login form** (`LoginFormView`). Only one
   field is visible at first: **Institution** — a required `<select>`.
   It has no default selection; the placeholder option
   (`"Select your institution"`) has an empty value and can't be submitted
   (`required` on the `<select>`).
3. The Institution list has one fixed entry, **"Platform Administration"**
   (for `super_admin` accounts, which have no single institution), followed
   by every real institution in the platform's public directory, sorted by
   name.
4. Once an institution is selected, **Email** and **Password** fields
   appear beneath it, along with the submit button. The card's logo swaps
   to the selected institution's logo (falls back to the default
   `/logo.png` for Platform Administration, since it has no logo).
5. On submit: the app signs in with Firebase Auth, then — once the
   signed-in account's actual institution is resolved from Firestore —
   confirms it matches what was selected in step 3.
   - **Match:** the user lands on `/dashboard` as normal.
   - **Mismatch:** the user is immediately signed back out and returned to
     `/login` with an error: _"This account doesn't belong to the selected
     institution. Select the correct institution and try again."_ Email is
     retained in the form; password is cleared.
6. After 3 failed sign-in attempts (wrong password/email, tracked across
   "← Back" → "Login" round-trips within the same visit), a "Forgot
   password? Contact your administrator." hint appears below the form.
   There is no self-service password reset.

---

## 2. Component Architecture

All login UI lives in one file:
[`src/scenes/(auth)/login/index.tsx`](<../../src/scenes/(auth)/login/index.tsx>).

```text
LoginPage (default export)                 — view switcher: "choice" | "login"
├── ChoiceView                             — Login / Register buttons
└── LoginFormView                          — the actual form (§1 steps 2-6)
```

- **`LoginPage`** (`index.tsx:365-380`) owns two pieces of state: which
  sub-view is showing, and `failedAttempts`. `failedAttempts` is lifted out
  of `LoginFormView` deliberately — `LoginFormView` unmounts when the user
  clicks "← Back," which would otherwise silently reset the "too many
  attempts" hint.
- **`LoginFormView`** (`index.tsx:79-363`) owns everything else: email,
  password, field errors, the institution list and selection, and the
  submit handler (`onSubmit`, `index.tsx:126-161`).
- **`PostLoginInstitutionGate`**
  ([`src/components/PostLoginInstitutionGate.tsx`](../../src/components/PostLoginInstitutionGate.tsx))
  is a separate component that sits **above** `LoginPage` in the tree — it's
  what the `/login` route actually renders (see [§10](#10-routing)), and it
  renders `<LoginPage />` itself while there's nothing to decide yet. It
  owns all post-auth navigation decisions; `LoginFormView` does not
  navigate on a successful sign-in at all (see [§3](#3-the-institution-match-mechanism)).
- **`Protected`** ([`src/components/Protected.tsx`](../../src/components/Protected.tsx))
  is the unrelated guard wrapping the _dashboard_ route tree. It only
  checks `loading`/`user` — it has no awareness of institution selection.
  This matters: once the browser is on `/dashboard`, `Protected` is the
  only thing standing between an authenticated user and the app; the
  institution-match check must complete _before_ that transition, not
  after (see [§3](#3-the-institution-match-mechanism)).

---

## 3. The Institution-Match Mechanism

### Why this needs a dedicated mechanism at all

`AuthContext.signIn()` takes no institution parameter — Firebase Auth is a
single, project-wide user pool (see [§4](#4-authcontext--auth-state-resolution)); institution scoping is
resolved _after_ authentication, by reading `users/{uid}` from Firestore.
That means at the moment `signIn(email, password)` resolves, the app
doesn't yet know which institution the signed-in account belongs to — it
has to wait for that separate, async resolution before it can compare it
against what the user selected on the form.

### The one-shot handoff: `pendingLoginInstitution.ts`

[`src/lib/pendingLoginInstitution.ts`](../../src/lib/pendingLoginInstitution.ts)
is a small sessionStorage-backed helper, structurally identical in spirit
to `filterPersistence.ts`'s try/catch-wrapped storage pattern but with
one-shot "read-and-clear" (consume) semantics that module doesn't have:

```ts
const KEY = "sms_pending_login_institution";
export const PLATFORM_ADMIN_SENTINEL = "__platform_admin__";

export function setPendingLoginInstitution(value: string): void {
  /* try/catch sessionStorage.setItem */
}
export function consumePendingLoginInstitution(): string | null {
  /* read, then remove, in one call */
}
export function doesInstitutionMatch(
  selected: string,
  resolvedInstitutionId: string | null,
): boolean {
  if (selected === PLATFORM_ADMIN_SENTINEL)
    return resolvedInstitutionId === "*";
  return selected === resolvedInstitutionId;
}
```

- `setPendingLoginInstitution` is called in `LoginFormView.onSubmit`
  (`index.tsx:137`), immediately before `signIn()` — writing whatever was
  selected in the Institution dropdown (a real institution's Firestore ID,
  or `PLATFORM_ADMIN_SENTINEL`).
- `consumePendingLoginInstitution` is called exactly once, by
  `PostLoginInstitutionGate`, after auth resolves. A second call always
  returns `null` — this is what lets the gate distinguish "a login attempt
  just happened on this route" from "an already-signed-in session landed
  on `/login` directly" (e.g. back button, bookmark), which should just
  redirect to `/dashboard` with no mismatch check at all.
- `doesInstitutionMatch` special-cases the sentinel: it matches only
  against `institutionId === '*'`, which is the exact sentinel
  `AuthContext` assigns to `super_admin` accounts (§4). A real institution
  ID matches only the identical resolved ID — a `super_admin` selecting a
  real institution by mistake is correctly treated as a mismatch, since
  their resolved `institutionId` is always `'*'`, never a real ID.

### Why this can't be a component-local effect

An earlier design considered watching `AuthContext` state from a
`LoginFormView`-local `useEffect`. That doesn't work: `App.tsx`'s `/login`
route already needs its own logic to decide what to render once
authenticated, and a _child_ component's effect reacting to the exact same
state transition (`loading`/`user` resolving) cannot reliably win a race
against the _parent_ route's own redirect decision — both are triggered by
the identical re-render. Moving the whole decision into the route element
itself (`PostLoginInstitutionGate`) sidesteps the race entirely, since
there's only one place making the decision.

### `PostLoginInstitutionGate.tsx` — the gate itself

```tsx
export default function PostLoginInstitutionGate() {
  const { user, loading, institutionId, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user) return;

    const pending = consumePendingLoginInstitution();
    if (pending === null) {
      navigate("/dashboard", { replace: true }); // already-signed-in session hitting /login directly
      return;
    }
    if (doesInstitutionMatch(pending, institutionId)) {
      navigate("/dashboard", { replace: true });
    } else {
      signOut().then(() => {
        navigate("/login", { replace: true, state: { error: MISMATCH_ERROR } });
      });
    }
  }, [loading, user, institutionId, navigate, signOut]);

  if (!loading && user) return null; // resolved + signed in: effect above takes over next tick
  return <LoginPage />; // still resolving, or not signed in: render the form
}
```

On a mismatch, `signOut()` is awaited _before_ navigating back to
`/login` — this both clears the Firebase Auth session and (via
`AuthContext.signOut`, §4) sweeps any persisted per-page filters, so no
state from the wrong account's session lingers. The mismatch error string
travels back to `/login` via React Router's `state` on the `Navigate`
call, which `LoginFormView` reads once on mount as the initial value of
its `globalError` state (`index.tsx:97-99`):

```ts
const [globalError, setGlobalError] = useState<string | null>(
  (location.state as { error?: string } | null)?.error ?? null,
);
```

### A bug this design had to close: the competing redirect

`LoginFormView.onSubmit`'s success branch originally _also_ called
`navigate("/dashboard", { replace: true })` directly, on the assumption
that `PostLoginInstitutionGate` would "re-intercept" that navigation. It
doesn't: changing the URL to `/dashboard` flips `App.tsx`'s `isAuthRoute`
check (§10) to `false`, switching the entire rendered route tree away from
`/login` (where `PostLoginInstitutionGate` lives) to the dashboard tree,
gated only by `Protected` — which has no institution-match logic at all.
The practical effect was a full bypass: any account could sign into any
selected institution's context, unblocked, because the gate's effect never
got a chance to run before the URL — and the whole rendered tree — had
already moved on.

The fix: `onSubmit`'s success branch (`index.tsx:154-160`) does **not**
navigate at all. `PostLoginInstitutionGate` is the sole owner of
post-auth navigation; `LoginFormView` only sets `loading`/`pending` state
and lets the still-mounted gate (the form only ever renders inside it —
see the tree in [§2](#2-component-architecture)) react to the resulting `AuthContext`
change on its own.

---

## 4. AuthContext — Auth State Resolution

[`src/lib/AuthContext.tsx`](../../src/lib/AuthContext.tsx) is the single
source of truth for `user`, `role`, `institutionId`, and profile fields
app-wide — not login-specific, but central to how login resolves.

- **Single Auth pool:** one Firebase project, one Firebase Auth user pool
  for the entire multi-tenant app. Multi-tenancy is achieved purely via
  Firestore data scoping (`institutionId` fields/paths), not separate Auth
  pools or projects per institution. Email addresses are globally unique
  across the whole platform, not just within one institution.
- **`signIn(email, password)`** (`AuthContext.tsx:220-227`) wraps
  `signInWithEmailAndPassword` in a try/catch, returning
  `{ error: Error | null }` rather than throwing — this is what
  `LoginFormView.onSubmit` awaits directly.
- **Institution/role resolution happens after auth, not as part of it.**
  `onAuthStateChanged` (`AuthContext.tsx:61-87`) fires once Firebase
  confirms the credential, setting `user` and immediately setting
  `loading = true` again (even though it may already have been `false`)
  before awaiting `fetchRole(uid)` — otherwise a stale `loading = false`
  could let `Protected` briefly render the dashboard with the _previous_
  role/institution still in context.
- **`fetchRole(uid)`** (`AuthContext.tsx:89-169`) reads `users/{uid}`,
  and:
  - Sets `institutionId` to the literal sentinel `'*'` if
    `role === 'super_admin'`, otherwise to `data.institutionId`
    (`AuthContext.tsx:103`). This sentinel is exactly what
    `doesInstitutionMatch` (§3) checks the `PLATFORM_ADMIN_SENTINEL`
    selection against.
  - Signs the user back out if no role is found on the document
    (`AuthContext.tsx:95-99`) or if the primary profile read itself fails
    (`AuthContext.tsx:162-165`) — an authenticated account with no
    readable `users/{uid}` document cannot safely use the app.
  - Also fetches the institution's brand data (`institutions/{id}`) for
    display purposes, and writes a `sign_in` activity-log entry once per
    session (deduplicated via a separate `sessionStorage` key,
    `SESSION_SIGNIN_KEY`).
- **`signOut()`** (`AuthContext.tsx:229-233`) clears the sign-in
  dedup key, sweeps all persisted per-page filters
  (`clearAllPersistedFilters()`), then calls Firebase's `signOut`. This is
  what `PostLoginInstitutionGate` calls on a mismatch.

---

## 5. Institution Data Sources

[`src/lib/registrationDirectory.ts`](../../src/lib/registrationDirectory.ts)
exposes two cached readers over the same `registration_directory`
collection (§7), each backing a different picker:

| Function                       | Used by                           | Filter                           | Cache                   |
| ------------------------------ | --------------------------------- | -------------------------------- | ----------------------- |
| `fetchAcceptingInstitutions()` | `/register`'s institution picker  | `acceptingRegistrations == true` | `cachedInstitutions`    |
| `fetchAllInstitutions()`       | `/login`'s Institution `<select>` | none — every entry               | `cachedAllInstitutions` |

They're kept as two separate functions with two separate caches rather
than one parameterized function, because the two callers have genuinely
different needs: `/register` should only ever show institutions currently
open to new registrations, while `/login` needs _every_ institution — one
that's stopped accepting new registrations still has existing staff and
students who need to sign in. Both cache the in-flight promise itself
(not just the resolved value), so two callers racing on first load share
one Firestore read instead of two; both cache for the browser tab's
lifetime (cleared only on a full page reload).

`DirectoryOption` (`{ id: string } & RegistrationDirectoryEntry`) is the
shape both functions resolve to; `RegistrationDirectoryEntry` is defined
in `firebase.ts` (§7).

---

## 6. Institution Creation & Directory Seeding

For an institution to be selectable on `/login`, it needs a document in
`registration_directory` (§7) — the collection both readers in §5 query.
Three separate mechanisms keep that collection populated:

1. **Creation-time seed.** [`src/components/forms/InstitutionForm.tsx`](../../src/components/forms/InstitutionForm.tsx)
   (`super_admin`-only) writes both `institutions/{id}` and
   `registration_directory/{id}` in the same `onSubmit` handler
   (`InstitutionForm.tsx:52-75`), the latter with
   `acceptingRegistrations: false` — so a brand-new institution is
   immediately selectable on `/login` without an admin needing to
   separately visit the registration toggle first.
2. **Ongoing self-heal.** [`src/components/RegistrationDirectoryToggle.tsx`](../../src/components/RegistrationDirectoryToggle.tsx)
   is the institution-side settings UI that turns `acceptingRegistrations`
   on/off. Beyond the explicit toggle action, it also has a silent
   keep-fresh effect (`RegistrationDirectoryToggle.tsx:46-74`): every time
   an `institution_admin` visits this settings section, if the directory
   entry is already accepting registrations but has since drifted out of
   sync with the institution's actual name, logo, or active academic year,
   it's silently re-written. This is _not_ redundant with the
   creation-time seed above — it's the only thing that keeps a
   long-lived, already-public entry from going stale, and it's unaffected
   by anything in this login work.
3. **One-off backfill for pre-existing institutions.**
   [`scripts/backfill-registration-directory.mjs`](../../scripts/backfill-registration-directory.mjs)
   — a one-time Admin SDK script (already run against production) that
   created `registration_directory` entries for every institution that
   predated mechanism (1). It explicitly excludes three manually-created,
   non-institution documents that live in the `institutions` collection —
   `_placeholder`, `_platform` (the `super_admin` platform-level
   audit-log sentinel), and `master` (a reserved, currently-unused slot)
   — via a hardcoded `NON_INSTITUTION_IDS` skip-list, so none of them
   ever surface as selectable "institutions" on the public login page.
   Idempotent and safe to re-run (only creates missing entries, never
   overwrites existing ones); not needed again unless a new bulk-created
   or manually-restored institution similarly bypasses mechanism (1).

---

## 7. Firebase — Collections & Document Shapes

### `registration_directory/{institutionId}`

The public directory both `/login` and `/register` read from. Document ID
is the institution's own ID (same ID as the corresponding `institutions/{id}`
document). Defined as `RegistrationDirectoryEntry` in
[`src/lib/firebase.ts:625-633`](../../src/lib/firebase.ts):

```ts
export type RegistrationDirectoryEntry = {
  name: string;
  logoUrl?: string;
  acceptingRegistrations: boolean;
  activeAcademicYearId?: string;
  activeAcademicYearName?: string;
  updatedAt: Timestamp | string;
  updatedBy: string;
};
```

Note `logoUrl` is typed optional here, but every writer in this codebase
(`InstitutionForm.tsx`, `RegistrationDirectoryToggle.tsx`, the backfill
script) always writes it explicitly as `null` when absent, never omits it
— a deliberate null-sentinel convention, not an accident.

### `institutions/{institutionId}`

The authoritative institution record (name, status, brand fields). Not
all documents in this collection are real institutions — see the
sentinel/reserved IDs called out in [§6](#6-institution-creation--directory-seeding) item 3
(`_placeholder`, `_platform`, `master`), which deliberately have no
`registration_directory` counterpart.

### `users/{uid}`

Read by `AuthContext.fetchRole()` (§4) immediately after authentication.
Relevant fields for login purposes: `role`, `institutionId`, `status`. Full
shape is `UserDocument` in
[`src/lib/firebase.ts:186-`](../../src/lib/firebase.ts).

---

## 8. Firebase — Security Rules

Both rule blocks below are unchanged by this work — the existing rules
already covered every access pattern this login flow needs.

### `registration_directory` — public read, scoped write

```javascript
match /registration_directory/{institutionId} {
  allow read: if true;
  allow write: if isAdminOrAbove()
    && (isSuperAdmin() || myInstitutionId() == institutionId);
}
```

(`firestore.rules:735-739`) — the **only** collection in this app with an
unconditional `allow read: if true`. This is deliberate: both the
`/register` picker and the pre-auth `/login` Institution dropdown need to
read this collection _before_ the visitor is signed in, so no
authentication-gated rule would work here. Writes are still scoped: only
that institution's own admin (checked via `myInstitutionId()`, resolved
through `users/{uid}`, §4) or a `super_admin` may write an entry, and only
to that institution's own document ID.

### `institutions` — read-scoped to your own institution

```javascript
match /institutions/{institutionId} {
  allow read: if isSuperAdmin() || myInstitutionId() == institutionId;
  allow create: if isSuperAdmin();
  allow update: if isSuperAdmin()
    || (isAdmin() && myInstitutionId() == institutionId);
  allow delete: if isSuperAdmin();
}
```

(`firestore.rules:719-725`) — note this is a _narrower_ read rule than
`registration_directory`'s. This is exactly why the public directory
exists as its own top-level collection rather than the app reading
`institutions` directly pre-auth: an anonymous visitor could never satisfy
`isSuperAdmin() || myInstitutionId() == institutionId` (there is no
`request.auth` yet), so `registration_directory` deliberately duplicates
just the public-safe subset of institution data (name, logo,
registration status) behind a permissive read rule, while the full
`institutions` document stays access-controlled.

### Rule helper functions relevant here

Defined near the top of `firestore.rules`:

```javascript
function me() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data; }
function myRole() { return me().role; }
function myInstitutionId() { return me().institutionId; }
function isSuperAdmin() { return isSignedIn() && myRole() == 'super_admin'; }
function isAdmin() { return isSignedIn() && myRole() == 'institution_admin'; }
function isAdminOrAbove() { return isSuperAdmin() || isAdmin(); }
```

`myInstitutionId()` reads the _same_ `users/{uid}.institutionId` field
that client-side `AuthContext.fetchRole()` reads — the two are always
consistent, since both ultimately trust the same document. There is no
rules-level equivalent of the `'*'` sentinel `AuthContext` assigns to
`super_admin` client-side; `isSuperAdmin()` is checked as its own
independent branch in every rule that needs it.

---

## 9. Firebase — Indexes

**None required.** Every Firestore read this login flow performs is
either a single-document `get()` (`users/{uid}`, `institutions/{id}`) or
an unfiltered/single-field-filtered collection read against
`registration_directory` — none of which need a composite index.
Confirmed against `firestore.indexes.json`: no index references either
`registration_directory` or `institutions`.

---

## 10. Routing

[`src/App.tsx`](../../src/App.tsx) splits its entire route tree on one
boolean, computed once per render:

```ts
const isAuthRoute =
  location.pathname.startsWith("/login") ||
  location.pathname.startsWith("/register");
```

When `isAuthRoute` is true, `App()` renders a _separate_, small `<Routes>`
tree covering only `/login`, `/register`, and `/register/:institutionId` —
entirely disjoint from the large dashboard route tree rendered otherwise.
This split is why the competing-redirect bug in [§3](#3-the-institution-match-mechanism) mattered as much as
it did: navigating to `/dashboard` doesn't just change what's rendered
_within_ the auth tree, it discards the auth tree (and everything mounted
inside it, including `PostLoginInstitutionGate`) entirely in favor of the
dashboard tree.

```tsx
<Route path="/login" element={<PostLoginInstitutionGate />} />
<Route path="/register" element={ !loading && user ? <Navigate to="/dashboard" replace /> : <RegistrationInstitutionPickerPage /> } />
<Route path="/register/:institutionId" element={ !loading && user ? <Navigate to="/dashboard" replace /> : <StudentRegistrationFormPage /> } />
```

`/register` and `/register/:institutionId` are untouched by this work —
they keep their own, simpler `!loading && user` redirect ternary, since
neither has an institution-selection-before-credentials step to race
against. Only `/login` needed the dedicated gate component.

---

## 11. File Reference

| File                                                                                                           | Role                                                                     |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`src/scenes/(auth)/login/index.tsx`](<../../src/scenes/(auth)/login/index.tsx>)                               | `LoginPage`, `ChoiceView`, `LoginFormView` — all login UI and form logic |
| [`src/components/PostLoginInstitutionGate.tsx`](../../src/components/PostLoginInstitutionGate.tsx)             | Route-level guard; sole owner of post-auth navigation for `/login`       |
| [`src/lib/pendingLoginInstitution.ts`](../../src/lib/pendingLoginInstitution.ts)                               | sessionStorage one-shot handoff + `doesInstitutionMatch`                 |
| [`src/lib/AuthContext.tsx`](../../src/lib/AuthContext.tsx)                                                     | `signIn`/`signOut`, role/institution resolution, app-wide auth state     |
| [`src/lib/registrationDirectory.ts`](../../src/lib/registrationDirectory.ts)                                   | `fetchAllInstitutions` / `fetchAcceptingInstitutions`, both cached       |
| [`src/components/forms/InstitutionForm.tsx`](../../src/components/forms/InstitutionForm.tsx)                   | Institution creation; seeds `registration_directory` at creation time    |
| [`src/components/RegistrationDirectoryToggle.tsx`](../../src/components/RegistrationDirectoryToggle.tsx)       | Institution-side registration toggle + directory self-heal               |
| [`src/components/Protected.tsx`](../../src/components/Protected.tsx)                                           | Dashboard route guard (auth-only, institution-match-unaware)             |
| [`src/App.tsx`](../../src/App.tsx)                                                                             | Route tree; `/login` → `PostLoginInstitutionGate`                        |
| [`scripts/backfill-registration-directory.mjs`](../../scripts/backfill-registration-directory.mjs)             | One-off Admin SDK backfill (already run)                                 |
| [`src/lib/__tests__/pendingLoginInstitution.test.ts`](../../src/lib/__tests__/pendingLoginInstitution.test.ts) | Unit tests — §12                                                         |
| `firestore.rules:719-739`                                                                                      | `institutions` + `registration_directory` rule blocks                    |

---

## 12. Testing

`src/lib/__tests__/pendingLoginInstitution.test.ts` covers the one
genuinely pure, isolated piece of this system: `setPendingLoginInstitution`
/ `consumePendingLoginInstitution` round-tripping and clearing correctly,
and every branch of `doesInstitutionMatch` (real-vs-real match/mismatch,
the `PLATFORM_ADMIN_SENTINEL` case against `'*'` and against a real ID,
and the unresolved-`null` case). Uses an in-memory fake `sessionStorage`
installed at `globalThis.sessionStorage`, matching the existing pattern in
`filterPersistence.test.ts`.

**Not covered by automated tests** — consistent with this codebase's
existing precedent of not testing page-level components or one-off
scripts:

- `PostLoginInstitutionGate`'s actual routing/timing behavior (the thing
  the [§3](#3-the-institution-match-mechanism) bug lived in) — verified only by manual testing.
- `LoginFormView`'s JSX/gating behavior.
- `InstitutionForm.tsx`'s and the backfill script's Firestore writes.

---

## 13. Known Limitations / Risks

- **No self-service password reset.** The "Forgot password?" text next to
  the Password field is inert (`cursor-default`, no handler) — the only
  path is "Contact your administrator," and the `failedAttempts >= 3` hint
  says the same thing.
- **`registration_directory`'s self-heal effect (§6 item 2) is the only
  thing keeping a long-lived entry from drifting stale** — it only runs
  when an `institution_admin` happens to visit that settings section.
  There's no scheduled/triggered re-sync.
- **The backfill script's `updatedBy` value is a literal string**
  (`'backfill-registration-directory-script'`), not a real `users/{uid}`
  reference — fine today since nothing downstream assumes `updatedBy` is
  always a valid user reference, but would need revisiting if that ever
  changes.
- **Email uniqueness is platform-wide, not per-institution** (§4) — a
  prospective user cannot have the same email address registered under
  two different institutions. This is an existing, unrelated platform
  constraint, not something introduced by this work, but it's the reason
  the institution-match check exists at all: without it, correctly
  authenticating with valid credentials says nothing about which
  institution's data the account should be allowed to view.
- **The sentinel documents in `institutions`** (`_placeholder`,
  `_platform`, `master`) rely on a hardcoded skip-list in the backfill
  script (§6). If a new sentinel/reserved document is ever added to that
  collection, it needs to be added to `NON_INSTITUTION_IDS` there too, or
  it would incorrectly become selectable on `/login`.

---

## 14. Manual QA Checklist

- [ ] First view of `/login` → Login: only the Institution select is
      visible; Email/Password are not present until an institution is
      chosen.
- [ ] Selecting a real institution reveals Email/Password; the card's logo
      swaps to that institution's logo.
- [ ] Selecting Platform Administration reveals Email/Password; the logo
      falls back to the default.
- [ ] Deselecting back to the placeholder hides Email/Password again.
- [ ] **Matching credentials:** sign in with an account that belongs to
      the selected institution — lands on `/dashboard` normally.
- [ ] **`super_admin` via Platform Administration:** lands on `/dashboard`
      normally.
- [ ] **Mismatch:** valid credentials for institution A while institution
      B is selected — signed back out, redirected to `/login` with the
      mismatch error shown, email retained, password cleared.
- [ ] **`super_admin` selecting a real institution instead of Platform
      Administration:** treated as a mismatch.
- [ ] **Already-signed-in session hitting `/login` directly:** redirects
      straight to `/dashboard`, no mismatch check fires.
- [ ] **New institution created via the onboarding wizard:** immediately
      selectable on `/login`, no manual directory-toggle visit needed.
- [ ] `/register`'s own institution picker is unaffected — still lists
      only institutions with `acceptingRegistrations: true`.

---
