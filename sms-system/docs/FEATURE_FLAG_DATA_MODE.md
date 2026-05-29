# Feature Flag: Data Mode Toggle

## Overview

The data mode toggle is a developer-only mechanism that controls what data the UI
renders. It exists because several UI components were built scaffold-first with
hardcoded mock data before their Firestore queries were implemented. The toggle
lets a developer switch between three data states without a full rebuild.

The toggle is **invisible in production builds** (`import.meta.env.DEV === false`
causes `DevDataModeToggle` to return `null`). It appears as a floating `<select>`
dropdown in the bottom-right corner in development only.

---

## How It Works

### Evaluation order (highest → lowest precedence)

1. `localStorage` key `sms_data_mode_v2` — value `'mock'`, `'blank'`, or `'live'`;
   written by the toggle when a developer selects a mode. Persists across page
   refreshes until explicitly cleared.
2. `VITE_USE_MOCK_DATA` environment variable — per-environment default set at
   build/serve time (`'true'` for mock, anything else for blank).

This is resolved once at module load time in `src/lib/data.ts`:

```ts
export type DataMode = 'mock' | 'blank' | 'live';

const _valid: DataMode[] = ['mock', 'blank', 'live'];

const _defaultMode: DataMode =
  import.meta.env.VITE_USE_MOCK_DATA === 'true' ? 'mock' : 'blank';

const _stored =
  typeof localStorage !== 'undefined'
    ? localStorage.getItem('sms_data_mode_v2')
    : null;

const _override =
  _stored && (_valid as string[]).includes(_stored)
    ? (_stored as DataMode)
    : null;

export const DATA_MODE: DataMode = _override ?? _defaultMode;
export const USE_MOCK = DATA_MODE === 'mock'; // backwards compat — existing consumers unchanged
```

Because `DATA_MODE` is a module-level constant evaluated once on load, **changing
the mode requires a full page reload** to take effect. The toggle handles this
automatically by calling `window.location.reload()` after writing to `localStorage`.

### Why the localStorage key was renamed

The key was renamed from `sms_data_mode` to `sms_data_mode_v2` when the tri-state
system was introduced. The old two-state system used `'live'` to mean "blank/empty
states" (the non-mock fallback). The new `'live'` value means "fire real Firestore
queries" — a completely different behaviour. Renaming the key means any developer
with `sms_data_mode=live` cached in their browser will have that value ignored on
their first page load after the update, falling back safely to `'blank'` rather
than silently triggering production reads. The old key can remain in storage; it
will never be read.

### Resetting to the environment default

The toggle displays a `✕` button when a `localStorage` override is active.
Clicking it removes the `sms_data_mode_v2` key and reloads, reverting to whatever
`VITE_USE_MOCK_DATA` dictates.

---

## Current Modes (three-state)

| Toggle label | `DATA_MODE` value | `USE_MOCK` | What the UI shows |
|---|---|---|---|
| 🧪 Mock Data | `'mock'` | `true` | Hardcoded mock data from `src/lib/data.ts` and `src/components/superadmin/mockData.ts` |
| 📭 Blank Data | `'blank'` | `false` | Empty states with placeholder messages; zero Firestore reads |
| 🔴 Live Data | `'live'` | `false` | Real Firestore queries; renders actual data from the production database |

### Mock mode

Hardcoded data arrays in `data.ts` (teachers, students, parents, classes, etc.) and
`mockData.ts` (institutions). All UI components render immediately — zero network
activity. Use this for rapid UI iteration, layout work, and feature development
without any Firestore dependency.

### Blank mode

No data, no Firestore reads. Components render their empty states and placeholder
messages. This is the env default when `VITE_USE_MOCK_DATA` is not `'true'`. In
production, components that have not yet had live query logic implemented also show
this state — blank mode and production are currently identical code paths for any
component lacking a live query implementation.

### Live mode

Real Firestore queries fire. The UI renders whatever is currently in the production
database. **This mode is a deliberate developer opt-in** — it requires explicitly
selecting 🔴 Live Data in the toggle, and the toggle is hidden in production builds.
See the [Critical Concern: Single Firebase Project](#critical-concern-single-firebase-project)
section for the full risk picture.

---

## Important: "Blank Data" and production are currently identical code paths

In production, `VITE_USE_MOCK_DATA` is expected to be `'false'`, so `DATA_MODE`
resolves to `'blank'` and `USE_MOCK` is `false` — the same result as toggling to
"Blank Data" in dev. This means that for any component which has not yet had its
Firestore queries implemented, the production UI will show the same empty states as
blank mode. This is intentional and expected until live query logic is added per
component.

---

## Critical Concern: Single Firebase Project

**The project currently uses a single Firebase project for both development and
production.**

This means that when `live` mode is active in a development environment:

- Every Firestore `getDocs`, `getDoc`, `onSnapshot`, or `query` call reads from
  the **production database**.
- Write operations (including activity log entries created on sign-in, profile
  saves, and any future admin actions) write to the **production database**.
- All reads and writes count against the **production quota** on the Spark
  (free) tier. The Spark plan allows 50,000 reads and 20,000 writes per day
  across the entire project. Development activity in `live` mode consumes the
  same daily budget as real user traffic.
- If a developer iterates on a component that fires multiple queries on each
  render (e.g., the KPI strip querying aggregates across multiple collections),
  switching to `live` mode repeatedly during development can exhaust the daily
  read quota and cause production users to receive permission-denied errors for
  the remainder of the day.

### Why `live` mode is misleading in a single-project setup

"Live Mode" implies the developer is previewing what production users will see.
In a single-project setup this is technically true in a narrow sense — they are
literally reading production data — but it conflates development activity with
production traffic in ways that are hard to reason about:

- Production data may be incomplete or inconsistent during early development,
  making `live` mode indistinguishable from `blank` mode if collections are empty.
- A developer testing a destructive admin action (e.g., suspending an institution)
  in `live` mode would modify production records.
- Query costs incurred in dev have no isolation from production quota.

### Recommended resolution

The safe and standard setup for a Firebase project is to maintain **two separate
Firebase projects**:

| Project | Purpose |
|---|---|
| `sms-dev` (or similar) | Development and testing. Seeded with representative fake data. Quota exhaustion here has no production impact. |
| `sms-prod` | Live production traffic only. Never touched by developer tooling. |

Each environment gets its own `.env` file pointing to the appropriate project:

```
# .env.development
VITE_FIREBASE_PROJECT_ID=sms-dev
VITE_USE_MOCK_DATA=false   # or 'true' to default to mock

# .env.production
VITE_FIREBASE_PROJECT_ID=sms-prod
VITE_USE_MOCK_DATA=false
```

With this separation in place, `live` mode in development queries the `sms-dev`
Firestore, leaving production completely isolated. The `sms-dev` database can be
seeded with representative data (institutions, users, roles) so that `live` mode
renders meaningfully without touching production records or quota.

---

## Firestore Security Rules: Live Mode Query Permissions

The following table documents whether each live-mode query fired by the
`super_admin` homepage is permitted by the current Firestore security rules for
a signed-in `super_admin`. This was verified against the rules as of the Phase 5
implementation.

| Widget | Operation | Collection / path | Rule anchor | Permitted? |
|---|---|---|---|---|
| KPI strip | `getCountFromServer` | `institutions` | `allow read: if isSignedIn()` | ✅ Yes |
| KPI strip | `getCountFromServer` with `where('status','==','active')` | `institutions` | `allow read: if isSignedIn()` | ✅ Yes |
| KPI strip | `getCountFromServer` | `users` | `allow read: if isOwner(uid)` &#124;&#124; `(isAdminOrAbove() && sameInstitution(...))` | ✅ Yes — see note below |
| KPI strip | `getCountFromServer` with `where('role','==','super_admin')` | `users` | Same as above | ✅ Yes — see note below |
| InstitutionsTable | `getDocs` ordered by `name` | `institutions` | `allow read: if isSignedIn()` | ✅ Yes |
| RecentSignups | `getDocs` ordered by `createdAt desc`, `limit(10)` | `institutions` | `allow read: if isSignedIn()` | ✅ Yes |
| AlertsFeed | `getDocs` on collectionGroup | `audit_log` | `allow read: if isSuperAdmin()` | ✅ Yes |

All live-mode queries are currently permitted. No Firestore console changes are
required before testing live mode.

### Note: `getCountFromServer` on `users` and rule short-circuit evaluation

The `users` collection rule references `resource.data.institutionId` inside the
`sameInstitution()` helper:

```
function sameInstitution(docInstitutionId) {
  return isSuperAdmin() || myInstitutionId() == docInstitutionId;
}

// users/{uid} rule:
allow read: if isOwner(uid)
  || (isAdminOrAbove() && sameInstitution(resource.data.institutionId));
```

For a `super_admin`, `isSuperAdmin()` evaluates to `true`, which causes
`sameInstitution()` to short-circuit via `||` — meaning `resource.data.institutionId`
is **never evaluated**. The overall read condition resolves to `true` without
requiring Firestore to inspect any individual user document.

For `getCountFromServer` (an aggregate/count query), Firestore evaluates rules at
query time rather than per-document. Because the `isSuperAdmin()` short-circuit
prevents `resource.data` from ever being accessed for a `super_admin` caller, the
count query is permitted without Firestore needing to load or examine individual
documents. This is the expected behaviour given Firebase's lazy (short-circuit)
evaluation of `||` expressions in security rules.

#### If the short-circuit assumption breaks in practice

**Symptom:** The KPI strip shows `"err"` when live mode is active, and the browser
console logs a `permission-denied` FirebaseError thrown from `fetchCounts()` in
`SuperAdminPage`. This would indicate that Firestore's rules evaluator is not
short-circuiting `resource.data.institutionId` for the count query, and is
attempting per-document evaluation instead.

**Fix:** Add an explicit `allow list` clause for `super_admin` to the `users` match
block in the Firestore console:

```
match /users/{uid} {
  allow list: if isSuperAdmin();   // ← add this line
  allow read: if isOwner(uid)
    || (isAdminOrAbove() && sameInstitution(resource.data.institutionId));
  allow create: if isAdminOrAbove() && writingToMyInstitution();
  allow update: if (isOwner(uid) && roleNotChanged() && institutionNotChanged())
    || (isAdminOrAbove() && sameInstitution(resource.data.institutionId) && institutionNotChanged());
  allow delete: if isSuperAdmin();
}
```

The explicit `allow list: if isSuperAdmin()` rule grants platform-wide list and
count access to `super_admin` without any dependency on `resource.data`, eliminating
the short-circuit assumption entirely. The more specific `allow read` rule continues
to govern individual document reads for all other callers.

This fix should also be applied if `InstitutionsTable` or `RecentSignups` ever
surface a `permission-denied` error from their `getDocs` calls on `institutions`,
though the `institutions` rule (`allow read: if isSignedIn()`) does not reference
`resource.data` and is therefore not subject to this concern.

---

## Live Query Coverage by Page

The table below tracks which pages/components have real Firestore query logic
implemented versus those still relying on mock data or empty states.

| Page / Component | Collection(s) queried | Live query implemented? |
|---|---|---|
| `AuditLogPage` (`/admin/audit-log`) | `institutions`, `activity_log` (collectionGroup) | ✅ Yes |
| `SuperAdminPage` — KPI strip | `institutions`, `users` | ✅ Yes (4 × `getCountFromServer`) |
| `SuperAdminPage` — `InstitutionsTable` | `institutions` | ✅ Yes (`getDocs` ordered by `name`) |
| `SuperAdminPage` — `RecentSignups` | `institutions` | ✅ Yes (`getDocs` ordered by `createdAt desc`, `limit(10)`) |
| `SuperAdminPage` — `AlertsFeed` | `audit_log` (collectionGroup) | ✅ Yes (`getDocs` `limit(10)`) |
| `SuperAdminPage` — `GrowthChart` | aggregated growth metrics | ⏸ Deferred — placeholder in both blank and live mode |
| `ProfilePage` — Contact info form (save) | `users/{uid}`, `users/{uid}/activity_log` | ✅ Yes (WriteBatch on save) |
| Sign-in activity log | `users/{uid}/activity_log` | ✅ Yes (written in `AuthContext`) |

This table should be updated as live query logic is added to each component.

---

## Files Involved

| File | Role |
|---|---|
| `src/lib/data.ts` | Defines and exports `DataMode`, `DATA_MODE`, and `USE_MOCK`; contains all mock data arrays for list pages |
| `src/components/DevDataModeToggle.tsx` | Floating dev-only `<select>` badge; reads/writes `sms_data_mode_v2` in `localStorage` and triggers reload |
| `src/components/superadmin/mockData.ts` | Mock institution data consumed by `InstitutionsTable` and `RecentSignups` in mock mode |
| `src/components/superadmin/InstitutionsTable.tsx` | Branches on `DATA_MODE`; shows mock, live (Firestore `getDocs`), or empty state |
| `src/components/superadmin/RecentSignups.tsx` | Branches on `DATA_MODE`; shows mock, live (Firestore `getDocs`), or empty state |
| `src/components/superadmin/AlertsFeed.tsx` | Branches on `DATA_MODE`; shows mock, live (Firestore `audit_log` collectionGroup), or empty state |
| `src/components/superadmin/GrowthChart.tsx` | Branches on `DATA_MODE`; shows mock chart or placeholder (live deferred) |
| `src/scenes/(dashboard)/super-admin/index.tsx` | Branches on `DATA_MODE`; fires `getCountFromServer` KPI queries in live mode |
