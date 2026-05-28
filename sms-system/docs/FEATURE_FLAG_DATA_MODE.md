# Feature Flag: Data Mode Toggle

## Overview

The data mode toggle is a developer-only mechanism that controls what data the UI
renders. It exists because several UI components were built scaffold-first with
hardcoded mock data before their Firestore queries were implemented. The toggle
lets a developer switch between data states without a full rebuild.

The toggle is **invisible in production builds** (`import.meta.env.DEV === false`
causes `DevDataModeToggle` to return `null`). It appears as a floating badge in
the bottom-right corner in development only.

---

## How It Works

### Evaluation order (highest → lowest precedence)

1. `localStorage` key `sms_data_mode` — value `'mock'` or `'live'`; written by
   the toggle when a developer clicks "switch". Persists across page refreshes
   until explicitly cleared.
2. `VITE_USE_MOCK_DATA` environment variable — per-environment default set at
   build/serve time (`'true'` for mock, anything else for live/blank).

This is resolved once at module load time in `src/lib/data.ts`:

```ts
const _defaultMode = import.meta.env.VITE_USE_MOCK_DATA === 'true' ? 'mock' : 'live';
const _sessionOverride = localStorage.getItem('sms_data_mode') as 'mock' | 'live' | null;
export const USE_MOCK = (_sessionOverride ?? _defaultMode) === 'mock';
```

Because `USE_MOCK` is a module-level constant evaluated once on load, **changing
the mode requires a full page reload** to take effect. The toggle handles this
automatically by calling `window.location.reload()` after writing to
`localStorage`.

### Resetting to the environment default

The toggle displays a `✕` button when a `localStorage` override is active.
Clicking it removes the `sms_data_mode` key and reloads, reverting to whatever
`VITE_USE_MOCK_DATA` dictates.

---

## Current Modes (two-state)

| Toggle label | `USE_MOCK` value | What the UI shows |
|---|---|---|
| 🧪 MOCK DATA | `true` | Hardcoded mock data from `src/lib/data.ts` and `src/components/superadmin/mockData.ts` |
| 📭 BLANK DATA | `false` | Empty states with placeholder messages; no Firestore reads |

### Important: "Blank Data" and production are currently identical code paths

In production, `VITE_USE_MOCK_DATA` is expected to be `'false'`, so `USE_MOCK`
evaluates to `false` — the same result as toggling to "Blank Data" in dev. This
means that for any component which has not yet had its Firestore queries
implemented, the production UI will show the same empty states as blank mode.
This is intentional and expected until live query logic is added per component.

---

## Proposed Third Mode: Live Mode

A third mode (`'mock' | 'blank' | 'live'`) has been discussed. Its intent is to
gate actual Firestore queries behind an explicit developer opt-in, so that:

- `mock` — hardcoded fake data; zero Firestore reads; safe for rapid UI iteration
- `blank` — no data; no reads; safe for layout and styling work
- `live` — real Firestore queries fire; mirrors what production will show

This is architecturally sound and provides a cleaner developer contract than the
current two-state system. However, there is a critical concern that must be
resolved before implementing it.

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
  making `live` mode indistinguishable from `blank` mode if collections are
  empty.
- A developer testing a destructive admin action (e.g., suspending an
  institution) in `live` mode would modify production records.
- Query costs incurred in dev have no isolation from production quota.

### Recommended resolution before implementing `live` mode

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

Until this separation exists, `live` mode should not be implemented, as it would
provide no safety boundary between development queries and production data.

---

## Current Live Query Coverage by Page

The table below tracks which pages/components have real Firestore query logic
implemented vs. those still relying on mock data or empty states.

| Page / Component | Collection(s) queried | Live query implemented? |
|---|---|---|
| `AuditLogPage` (`/admin/audit-log`) | `institutions`, `audit_log` (collectionGroup) | Yes |
| `SuperAdminPage` — KPI strip | — | No (static strings) |
| `SuperAdminPage` — `InstitutionsTable` | `institutions` | No (reads `mockData.ts`) |
| `SuperAdminPage` — `RecentSignups` | `institutions` | No (reads `mockData.ts`) |
| `SuperAdminPage` — `AlertsFeed` | `audit_log` / security events | No (inline constant) |
| `SuperAdminPage` — `GrowthChart` | aggregated growth metrics | No (inline constant) |
| `ProfilePage` — Contact info form (save) | `users/{uid}`, `users/{uid}/activity_log` | Yes (WriteBatch on save) |
| Sign-in activity log | `users/{uid}/activity_log` | Yes (written in `AuthContext`) |

This table should be updated as live query logic is added to each component.

---

## Files Involved

| File | Role |
|---|---|
| `src/lib/data.ts` | Defines and exports `USE_MOCK`; contains all mock data arrays for list pages |
| `src/components/DevDataModeToggle.tsx` | Floating dev-only badge; reads/writes `localStorage` and triggers reload |
| `src/components/superadmin/mockData.ts` | Mock institution data consumed by `InstitutionsTable` and `RecentSignups` |
| `src/components/superadmin/InstitutionsTable.tsx` | Reads `USE_MOCK`; shows mock institutions or empty state |
| `src/components/superadmin/RecentSignups.tsx` | Reads `USE_MOCK`; shows mock sign-ups or empty state |
| `src/components/superadmin/AlertsFeed.tsx` | Reads `USE_MOCK`; shows mock alerts or empty state |
| `src/components/superadmin/GrowthChart.tsx` | Reads `USE_MOCK`; shows mock chart or placeholder |
