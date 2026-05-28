# Live Mode Implementation Plan

## Background and Motivation

The feature flag (`USE_MOCK`) currently has two states: `mock` (hardcoded fake data) and
`blank` (empty states, no Firestore reads). Both states are dev-only; in production, `USE_MOCK`
evaluates to `false` (blank behaviour) because no live query logic exists for the super_admin
homepage widgets.

The goal of this plan is to introduce a third state — `live` — that fires real Firestore
queries and renders actual data. This gives developers a way to preview production-equivalent
behaviour in a dev environment without a full deployment.

**GrowthChart is explicitly out of scope.** Computing monthly institution and user growth from
raw Firestore documents would require aggregating by creation date across all documents,
which is read-expensive on the free tier. GrowthChart will continue showing mock data in
mock mode and a placeholder in both blank and live mode. It should be revisited if a
pre-computed stats document is introduced in the future.

---

## Architecture Decision: Single Firebase Project

The project currently uses **one Firebase project for both development and production**.
This means live mode queries in a dev environment read from and write to the production
Firestore database, consuming production quota.

The user has acknowledged this risk and opted to proceed with a single project. The risk
is documented in full in `FEATURE_FLAG_DATA_MODE.md`. The key mitigation is that `live`
mode requires a deliberate opt-in (explicit toggle selection) rather than being the
default, and the toggle is hidden in production builds.

**Recommended long-term resolution:** separate the project into `sms-dev` and `sms-prod`
Firebase projects with per-environment `.env` files. Until then, developers must be
deliberate about when they enable live mode.

---

## Scope

| Widget | Live mode behaviour |
|---|---|
| KPI strip (`SuperAdminPage`) | 4 × `getCountFromServer` reads |
| `InstitutionsTable` | `getDocs` on `institutions` collection |
| `RecentSignups` | `getDocs` with `orderBy('createdAt', 'desc'), limit(10)` |
| `AlertsFeed` | `getDocs` on `audit_log` collectionGroup, `limit(10)` |
| `GrowthChart` | **Deferred** — placeholder in live mode (same as blank mode) |

---

## Phase 1 — Tri-state Flag Refactor (`src/lib/data.ts`)

### 1.1 New exports

Replace the boolean `USE_MOCK` export with a typed tri-state `DATA_MODE` constant.
Keep `USE_MOCK` as a derived boolean so all existing list-page consumers
(`teachersData`, `studentsData`, etc.) continue to work without modification.

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

### 1.2 localStorage key rename: `sms_data_mode` → `sms_data_mode_v2`

**Why this rename is required.**

The old `'live'` localStorage value meant "blank/empty states" (it was the non-mock
state in the two-state system). The new `'live'` value means "fire Firestore queries."
If the key were kept the same, any developer with `sms_data_mode=live` already stored
in their browser would silently start firing production reads on their first page load
after the update — without any opt-in.

Renaming to `sms_data_mode_v2` means the old value is ignored. The resolved mode falls
back to the env default (`'blank'`), which is the safe no-reads state. Developers must
explicitly select live mode via the updated toggle UI.

`DevDataModeToggle` must read from and write to `sms_data_mode_v2` exclusively after
this change. The old key can be left in storage; it will be ignored.

---

## Phase 2 — `DevDataModeToggle` UI Update

### 2.1 Replace the cycle button with a `<select>` dropdown

The current toggle cycles between two states with a single "↔ switch" button. A cycle
button does not scale cleanly to three states — it forces the developer to pass through
an intermediate state to reach the one they want.

Replace it with a `<select>` element that lists all three modes explicitly. This allows
direct selection of any mode at any time regardless of the current state.

**Rendered appearance:**

```
[ 🧪 Mock Data  ▾ ]   [override]  [✕]
```

The `[override]` badge and `[✕]` clear button behave identically to the current toggle —
they appear only when a `localStorage` override is active, and `✕` clears the key and
reloads.

### 2.2 Select option labels and values

| `<option>` label | `value` written to `sms_data_mode_v2` | Icon |
|---|---|---|
| Mock Data | `'mock'` | 🧪 |
| Blank Data | `'blank'` | 📭 |
| Live Data | `'live'` | 🔴 |

The `🔴` icon for live mode is a deliberate visual signal that this mode touches
production data. Consider adding a `title` attribute warning on the live option:
`"Queries production Firestore — consumes real quota"`.

### 2.3 `applyMode` logic

```ts
const applyMode = (next: DataMode) => {
  localStorage.setItem('sms_data_mode_v2', next);
  window.location.reload();
};
```

The `onChange` handler of the `<select>` calls `applyMode(e.target.value as DataMode)`.
No cycle logic needed.

---

## Phase 3 — Existing Homepage Consumer Updates

The five files updated in the previous session branch on `USE_MOCK: boolean`. They must
be updated to branch on `DATA_MODE: DataMode` to distinguish blank from live.

**Pattern change:**

```ts
// Before
import { USE_MOCK } from "@/lib/data";
const rows = USE_MOCK ? mockData : [];

// After
import { DATA_MODE } from "@/lib/data";
import { mockData } from "./mockData";
const rows =
  DATA_MODE === 'mock' ? mockData :
  DATA_MODE === 'live' ? liveData :   // populated by Firestore query
  [];
```

Files affected:
- `src/components/superadmin/InstitutionsTable.tsx`
- `src/components/superadmin/RecentSignups.tsx`
- `src/components/superadmin/AlertsFeed.tsx`
- `src/components/superadmin/GrowthChart.tsx`
- `src/scenes/(dashboard)/super-admin/index.tsx`

The list-page files (`src/lib/data.ts` consumers: teachers, students, parents, etc.)
import only `USE_MOCK` and are **not affected** — `USE_MOCK` remains `true` in mock mode
and `false` in both blank and live mode, which is the correct behaviour for those pages.

---

## Phase 4 — `InstitutionDocument` Schema Extension (`src/lib/firebase.ts`)

The current `InstitutionDocument` type:

```ts
export type InstitutionDocument = {
  name: string;
  institutionId: string;
  createdAt: string;
  status: 'active' | 'inactive';
};
```

Two issues must be corrected and new fields added.

### 4.1 Corrections

**`status` type is wrong.** The UI (InstitutionsTable action buttons, status badges)
uses `'suspended'` not `'inactive'`. The `mockData.ts` Institution type also uses
`'active' | 'suspended'`. The type in `firebase.ts` must be corrected to match.

```ts
// Before
status: 'active' | 'inactive';

// After
status: 'active' | 'suspended';
```

### 4.2 New optional fields

```ts
export type InstitutionDocument = {
  name: string;
  institutionId: string;
  createdAt: string;
  status: 'active' | 'suspended';
  location?: string;       // city/country display in table and sign-ups list
  userCount?: number;      // total users across all roles
  studentCount?: number;
  teacherCount?: number;
  lastActiveAt?: string;   // ISO timestamp — for "Active (30d)" KPI and table display
};
```

All new fields are **optional** (`?`) because:
- Existing Firestore documents written before this plan do not have them.
- Components must handle their absence gracefully — display `"—"` rather than crash.

### 4.3 Note on populating the new fields

This plan does **not** implement the write logic for `userCount`, `studentCount`,
`teacherCount`, or `lastActiveAt`. Those values should be written by:
- Institution onboarding flow (set initial counts)
- User role assignment / removal (increment/decrement counts)
- Sign-in activity (update `lastActiveAt`)

Until that write logic exists, live mode will show `"—"` for those columns in
`InstitutionsTable` even when institution documents exist in Firestore. This is
expected behaviour, not a bug.

---

## Phase 5 — Live Query Implementation Per Widget

### 5.1 KPI Strip (`SuperAdminPage`)

**Current state:** `SuperAdminPage` is a pure presentational component with no hooks.
The KPI values are a static module-level array. This must change — the component needs
`useState` and `useEffect` to fetch counts when `DATA_MODE === 'live'`.

**Query design:** use `getCountFromServer` from `firebase/firestore`. This API (available
since Firebase JS SDK v9.13, confirmed available at v12.13.0 in this project) counts
documents server-side and returns a single integer. **Each count query costs exactly 1
Firestore read regardless of how many documents match.** This is the correct free-tier
approach for aggregate metrics.

```ts
import { getCountFromServer, collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Inside SuperAdminPage, triggered when DATA_MODE === 'live'
const [kpiLive, setKpiLive] = useState<{
  institutions: number | null;
  users: number | null;
  activeInstitutions: number | null;
  superAdmins: number | null;
}>({ institutions: null, users: null, activeInstitutions: null, superAdmins: null });

useEffect(() => {
  if (DATA_MODE !== 'live') return;
  async function fetchCounts() {
    const [instSnap, usersSnap, activeSnap, saSnap] = await Promise.all([
      getCountFromServer(collection(db, 'institutions')),
      getCountFromServer(collection(db, 'users')),
      getCountFromServer(query(collection(db, 'institutions'), where('status', '==', 'active'))),
      getCountFromServer(query(collection(db, 'users'), where('role', '==', 'super_admin'))),
    ]);
    setKpiLive({
      institutions: instSnap.data().count,
      users: usersSnap.data().count,
      activeInstitutions: activeSnap.data().count,
      superAdmins: saSnap.data().count,
    });
  }
  fetchCounts();
}, []);
```

**Reads per page load:** 4 (fixed — does not scale with document count).

KPI values display the loaded count while `kpiLive.x !== null`, `"…"` while loading,
and `"err"` on failure.

The `sub` text (e.g. "+3 this month") cannot be derived cheaply from Firestore without
a timestamp-range query. In live mode, `sub` should either be omitted or left blank
until a dedicated stats document is introduced.

### 5.2 `InstitutionsTable`

```ts
import { getDocs, collection, query, orderBy } from "firebase/firestore";
import { db, type InstitutionDocument } from "@/lib/firebase";

// Inside InstitutionsTable, triggered when DATA_MODE === 'live'
useEffect(() => {
  if (DATA_MODE !== 'live') return;
  async function fetchInstitutions() {
    const snap = await getDocs(query(collection(db, 'institutions'), orderBy('name')));
    const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as InstitutionDocument) }));
    setRows(docs);
  }
  fetchInstitutions();
}, []);
```

**Reads per page load:** N (one per institution document).

The existing search and status filter logic stays client-side against the fetched array —
no per-interaction Firestore queries, which avoids additional reads every time the user
types in the search box.

Optional fields (`location`, `userCount`, `studentCount`, `teacherCount`, `lastActiveAt`)
must be rendered with a `?? "—"` fallback.

**Firestore index required:** `institutions` collection, `name` ascending.
Single-field indexes are created automatically by Firestore — no manual
`firestore.indexes.json` entry required.

### 5.3 `RecentSignups`

```ts
import { getDocs, collection, query, orderBy, limit } from "firebase/firestore";
import { db, type InstitutionDocument } from "@/lib/firebase";

// Inside RecentSignups, triggered when DATA_MODE === 'live'
useEffect(() => {
  if (DATA_MODE !== 'live') return;
  async function fetchRecent() {
    const snap = await getDocs(
      query(collection(db, 'institutions'), orderBy('createdAt', 'desc'), limit(10))
    );
    const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as InstitutionDocument) }));
    setRecentSignups(docs);
  }
  fetchRecent();
}, []);
```

**Reads per page load:** maximum 10.

`createdAt` already exists in `InstitutionDocument` — no schema addition required for
this query to work. `location` will render `"—"` if absent.

**Firestore index required:** `institutions` collection, `createdAt` descending.
Single-field, auto-created.

### 5.4 `AlertsFeed`

No dedicated alerts collection exists. In live mode, derive content from recent
`audit_log` entries — the same collectionGroup query used by `AuditLogPage`.

```ts
import { getDocs, collectionGroup, query, orderBy, limit } from "firebase/firestore";
import { db, type AuditLogEntry } from "@/lib/firebase";

// Inside AlertsFeed, triggered when DATA_MODE === 'live'
useEffect(() => {
  if (DATA_MODE !== 'live') return;
  async function fetchAlerts() {
    const snap = await getDocs(
      query(collectionGroup(db, 'audit_log'), orderBy('timestamp', 'desc'), limit(10))
    );
    const entries = snap.docs.map((d) => d.data() as AuditLogEntry);
    setActiveAlerts(entries);
  }
  fetchAlerts();
}, []);
```

**Reads per page load:** maximum 10.

**Mapping `AuditLogEntry` to the `Alert` display shape:**

| Alert field | Source |
|---|---|
| `message` | `entry.detail` if non-empty, else `entry.eventType` |
| `time` | `entry.timestamp` formatted as a relative or absolute string |
| `severity` | Derived from `entry.eventType` — see table below |
| `read` | Always `false` (no read-tracking collection exists) |

**Severity derivation:**

| `eventType` | Severity |
|---|---|
| `sign_in`, `sign_out` | `"info"` |
| `profile_update`, `photo_update`, `notification_change`, `password_change` | `"info"` |
| Future security event types (e.g. `login_anomaly`, `brute_force`) | `"high"` or `"medium"` when added |

All current `ActivityEventType` values map to `"info"`. The high/medium severity
behaviours visible in mock mode are not yet reachable via real Firestore events
because the event types that would trigger them (`login_anomaly`, `brute_force_attempt`,
etc.) have not been defined or written. This is expected — the mock alert feed is
aspirational, not a reflection of current functionality.

**Firestore index required:** `audit_log` collectionGroup, `timestamp` descending.
This index likely already exists because `AuditLogPage` uses the identical query.
If it does not exist, Firestore will surface a direct link to create it on the first
failed query attempt in the browser console.

### 5.5 `GrowthChart`

**Deferred.** No changes beyond the `DATA_MODE` branch update in Phase 3 (blank and
live mode both show the placeholder). Computing historical monthly growth requires
either aggregating timestamps across all documents (expensive and complex client-side)
or a pre-computed stats document updated by write operations. Neither is in scope here.

---

## Phase 6 — Firestore Security Rules Verification

Before testing live mode in the browser, verify that the existing security rules permit
a `super_admin` to perform the following reads:

| Operation | Collection / path |
|---|---|
| `getDocs` on `institutions` | `institutions/{institutionId}` |
| `getCountFromServer` on `institutions` | `institutions/{institutionId}` |
| `getCountFromServer` on `users` | `users/{uid}` |
| `getCountFromServer` with `where('role', ...)` on `users` | `users/{uid}` |
| `getDocs` on `audit_log` collectionGroup | `users/{uid}/activity_log/{entry}` or `institutions/{id}/audit_log/{entry}` |

The `AuditLogPage` already performs institution reads and the collectionGroup audit
query, so rules likely already permit these. Verify before running live mode to avoid
silent failures (components receiving empty results that look like "no data" rather
than surfacing a permission error).

---

## Phase 7 — Update `FEATURE_FLAG_DATA_MODE.md`

After implementation, update `sms-system/docs/FEATURE_FLAG_DATA_MODE.md` to reflect:

- The tri-state system (replace the two-row mode table with three rows)
- The `sms_data_mode_v2` localStorage key (replace all references to `sms_data_mode`)
- Add a `live` mode subsection under the "Current Modes" section describing the
  single-project risk, deliberate opt-in requirement, and quota implications
- Update the live query coverage table — mark KPI strip, InstitutionsTable,
  RecentSignups, and AlertsFeed as implemented; GrowthChart as deferred

---

## Free-Tier Cost Analysis

All queries are scoped to use the minimum reads possible. `getCountFromServer` is the
critical tool — it charges 1 read per count query regardless of document count.

**Reads per super_admin homepage load in live mode:**

| Widget | Query | Reads |
|---|---|---|
| KPI strip | 4 × `getCountFromServer` | 4 (fixed) |
| InstitutionsTable | `getDocs(institutions)` | N (one per institution) |
| RecentSignups | `getDocs` with `limit(10)` | ≤ 10 |
| AlertsFeed | `getDocs` with `limit(10)` | ≤ 10 |
| **Total** | | **24 + N per load** |

**Illustrative daily budgets (Spark plan: 50,000 reads/day):**

| Institutions (N) | Loads/day | Reads/day | % of daily budget |
|---|---|---|---|
| 10 | 50 | 1,700 | 3.4% |
| 50 | 100 | 7,400 | 14.8% |
| 500 | 200 | 104,800 | **209% — over limit** |

The plan is safe while the institution count is in the low tens or low hundreds and
live mode usage is moderate. At scale (hundreds of institutions, high developer
activity in live mode), the `InstitutionsTable` `getDocs` becomes the bottleneck.
At that point, paginating the institutions query (`limit(25)` with cursor-based
pagination) would bring reads back within budget. This is not implemented in this
plan but should be added before the institution count grows past ~200.

**Write costs:** live mode does not add any new write paths. The only writes triggered
on the homepage are the `sign_in` activity log entry written in `AuthContext` on first
session load, which already existed before this plan.

---

## Recommended Implementation Order

1. **Phase 1** — flag refactor (`data.ts`). Establishes the new `DataMode` type and
   `DATA_MODE` constant. `USE_MOCK` continues to work for all existing consumers.
2. **Phase 7 (partial)** — update `FEATURE_FLAG_DATA_MODE.md` to reflect the new key
   name and three-state system.
3. **Phase 2** — toggle UI (`DevDataModeToggle`). Switches to `<select>` and the
   new `sms_data_mode_v2` key. Unblocks manual mode switching for testing.
4. **Phase 4** — `InstitutionDocument` schema extension (`firebase.ts`). Corrects the
   `status` type and adds optional fields. Must be done before Phases 5.2 and 5.3.
5. **Phase 3** — consumer updates. Switches the five homepage files from `USE_MOCK`
   boolean to `DATA_MODE` tri-state branching.
6. **Phase 5.1** — KPI strip live queries. Requires `SuperAdminPage` to gain hooks.
7. **Phase 5.2 + 5.3** — InstitutionsTable and RecentSignups live queries. Depend on
   Phase 4 being complete.
8. **Phase 5.4** — AlertsFeed live queries. Independent of Phase 4; can be done in
   parallel with 5.2/5.3.
9. **Phase 6** — security rules verification. Must be completed before browser testing
   of live mode.
10. **Phase 7 (final)** — update coverage table in `FEATURE_FLAG_DATA_MODE.md`.

---

## Deferred / Out of Scope

| Item | Reason deferred |
|---|---|
| `GrowthChart` live data | Requires pre-computed stats document; expensive to compute from raw documents |
| KPI `sub` text (e.g. "+3 this month") | Requires timestamp-range queries or a stats document |
| Pagination for `InstitutionsTable` | Not needed until institution count grows past ~200 |
| `userCount` / `studentCount` / `teacherCount` write logic | Belongs in institution onboarding and user management flows |
| `lastActiveAt` write logic | Belongs in sign-in and activity tracking flows |
| Dedicated `platform_alerts` collection | Future work; AlertsFeed derives from `audit_log` for now |
| Separate dev Firebase project | Recommended long-term; out of scope for this implementation |
