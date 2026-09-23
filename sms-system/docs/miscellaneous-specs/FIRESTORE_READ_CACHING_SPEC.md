# Firestore Read Caching & TanStack Query Adoption — Spec

## Overview

The app has grown to 123 direct Firestore read call sites (45 `onSnapshot`
listeners, 48 `getDocs`, 30 `getDoc`) with **no local caching configured at
all** (`initializeFirestore` runs on Firestore's default memory-only cache).
The README's own Firebase section already flags this as a live risk: 50,000
reads/day on the Spark plan, "dozens of `onSnapshot` listeners... read
pressure grows with institution size." This spec addresses it in two
complementary layers — a native Firestore persistence change (near-zero
effort, benefits every call site), and a broader adoption of
`@tanstack/react-query` + `@tanstack-query-firebase/react` to convert most of
the app's read paths to cached, deduplicated queries.

**Governing decisions, confirmed by the project owner during this spec's
brainstorm:**

- Primary goal is **reducing Firestore read/billing risk**, not just
  perceived latency.
- Realtime (`onSnapshot`) cross-user reactivity is **not essential** for most
  of the app — broad conversion of `onSnapshot` pages to cached one-off reads
  is in scope, not just the pages that were already one-off (`getDocs`/`getDoc`).
- **Confirmed exceptions that stay on live `onSnapshot`**: Gradebook
  (in-progress cell editing) and Attendance-taking (General/Subject Attendance
  while a teacher is actively marking a register). Every other page is a
  conversion candidate by default.
- Broad rollout across all applicable call sites is the intent — not a
  narrowly-scoped pilot left unexpanded.

---

## 1. Background — Investigation Findings

### 1.1 No local persistence is configured today

```ts
// src/lib/firebase.ts — current
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
```

No `localCache` option is set, so Firestore falls back to its default
memory-only cache — nothing survives a listener unmount, let alone a page
reload.

### 1.2 Why this matters more than it looks: resume tokens and delta billing

Confirmed via Firebase's own documentation (see Sources): every Firestore
query response includes a **resume token**. When the _same_ query is resumed
later (`getDocs()` call, or an `onSnapshot()` listener reconnecting) **within
30 minutes, with persistence enabled**, the server replies — and bills —
**only the documents that changed since the resume token's timestamp**, not
the full result set.

Without persistence, a listener's resume token is discarded the moment it
unmounts. Every navigation away and back starts a query from scratch: a full,
fully-billed read of the entire result set, every time — regardless of
whether anything actually changed.

### 1.3 A concrete, already-observed redundant-read pattern

Four pages independently run the identical, unfiltered query and filter by
role client-side:

- `src/scenes/(dashboard)/list/students/index.tsx`
- `src/scenes/(dashboard)/list/teachers/index.tsx`
- `src/scenes/(dashboard)/list/parents/index.tsx`
- `src/scenes/(dashboard)/registrations/index.tsx`

```ts
onSnapshot(query(collection(db, "users"), where("institutionId", "==", institutionId)), ...)
```

Each is a **full read of the institution's entire `users` collection**
(the bulk-seed stress test targets ~2,500 users/institution), independently,
with no sharing. Visiting all three list pages in one session reads the same
collection three separate times.

### 1.4 `useInstitutionAcademicCalendar()` has the same shape of problem

12 files call this hook independently (`ClassForm`, all 4 Attendance pages,
`AttendanceScopeModal`, admin & senior-teacher dashboards, `BigCalendar`,
`AttendanceChart`, the Academic Calendar page itself) — each mounts its own
`onSnapshot` subscriptions on `academicYears`/`terms`/`nonSchoolDays`.
`CurrentTermContext` already solves the analogous problem for the _current
term value_ (one shared context, one source of truth) — it does not solve it
for the _underlying listeners_, which stay per-consumer.

### 1.5 Nothing like this exists in the app today

No caching/query library is installed (`@tanstack/react-query` and
`@tanstack-query-firebase/react` are both absent from `package.json`). The
closest existing precedent is hand-rolled and narrow: the Students/Teachers
list pages' `photoCache` + `requestedPhotoUids` ref pattern (a bounded,
manually-managed per-page cache for one specific field) — a real but small-
scale instance of the same instinct this spec generalizes.

### 1.6 What `@tanstack-query-firebase/react` actually is

Read directly from the package source (not just docs), since this materially
changes the plan:

```ts
// packages/react/src/firestore/useCollectionQuery.ts — the entire read path
queryFn: async () => {
  if (firestore?.source === "server") return await getDocsFromServer(query);
  if (firestore?.source === "cache") return await getDocsFromCache(query);
  return await getDocs(query);
};
```

`useCollectionQuery`/`useDocumentQuery` are thin `useQuery` wrappers around
one-off `getDocs`/`getDoc`. **There is no live-subscription hook in this
package at all** — its caching/deduplication benefit applies only to
converted (or already one-off) reads, never to a listener left on
`onSnapshot`. This is precisely why this spec's Phase 3 exceptions (Gradebook,
Attendance-taking) must stay on raw `firebase/firestore` `onSnapshot`, not
this library — there's no code path in the package that would support them
anyway.

The package's other exports are thin mutation wrappers
(`useAddDocumentMutation`, `useSetDocumentMutation`, `useUpdateDocumentMutation`,
`useDeleteDocumentMutation`, `useWriteBatchCommitMutation`,
`useRunTransactionMutation`) plus network/persistence controls
(`useEnableNetworkMutation`, `useDisableNetworkMutation`,
`useClearIndexedDbPersistenceMutation`). None offer special read-reduction
behavior beyond what `@tanstack/react-query`'s own caching already provides —
their value is consistency (a uniform loading/error/mutate shape) rather than
a new mechanism.

**Peer dependencies** (from the npm registry, latest `2.1.1`, published
2025-08-27): `firebase: "^11.3.0 || ^12.0.0"`, `@tanstack/react-query: "^5"` —
both compatible with this app's `firebase ^12.15.0` and React `^19.2.7`. Worth
noting: no release in over a year as of this writing — not abandoned, but not
under active weekly development either.

---

## 2. Phase 0 — Enable Firestore's Native Persistent Cache

Do this regardless of any decision about TanStack Query. Touches one file,
benefits all 123 call sites uniformly, and is the direct fix for §1.2's
30-minute delta-billing mechanism.

```ts
// src/lib/firebase.ts
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Timestamp,
} from "firebase/firestore";

export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
```

`persistentMultipleTabManager()` is required (not the single-tab default)
since this is a normal multi-tab-capable web app — without it, opening the
dashboard in two tabs would have the second tab silently fall back to
memory-only caching. Supported in Chrome, Safari, and Firefox (documented
browser support — no impact expected, this app already targets evergreen
browsers).

**No code changes needed anywhere else.** This is a pure infrastructure
change to how the existing SDK calls behave.

---

## 3. Phase 1 — Install TanStack Query

```
npm install @tanstack/react-query @tanstack-query-firebase/react
npm install -D @tanstack/react-query-devtools
```

New file, `src/lib/queryClient.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // "Realtime not essential" (confirmed decision) — a short staleness
      // window is acceptable for the vast majority of converted pages.
      // Per-query overrides are expected for anything needing to feel
      // fresher (e.g. right after a create/update — see §5's invalidation
      // convention, which handles that case explicitly rather than via a
      // shorter global default).
      staleTime: 60_000,
      // Firestore's own SDK already manages connection/reactivity concerns
      // differently than a typical REST API; refetching every window focus
      // would undercut the whole point of this caching layer.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

Mount in `src/main.tsx`, following the exact provider-nesting convention
already established there (`AuthProvider > CurrentTermProvider > ToastProvider`):

```tsx
// BEFORE:
<AuthProvider>
  <CurrentTermProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </CurrentTermProvider>
</AuthProvider>

// AFTER:
<QueryClientProvider client={queryClient}>
  <AuthProvider>
    <CurrentTermProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </CurrentTermProvider>
  </AuthProvider>
</QueryClientProvider>
```

Placed outermost since it depends on nothing else in the tree, and several
converted queries (§4/§5) will need `useAuth()`'s `institutionId` inside their
`queryKey` — `AuthProvider` being a descendant of `QueryClientProvider` is
required for that to work.

`@tanstack/react-query-devtools` is dev-only tooling for inspecting cache
state during development — mount it conditionally, matching the existing
`DevDataModeToggle`'s dev-only-visibility convention.

---

## 4. Phase 2 — Pilot: the Users-Collection Redundancy

New shared hook, `src/hooks/useInstitutionUsers.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { USE_MOCK } from "@/lib/data";

export function useInstitutionUsers() {
  const { institutionId } = useAuth();
  return useQuery({
    queryKey: ["users", institutionId],
    queryFn: async () => {
      const snap = await getDocs(
        query(
          collection(db, "users"),
          where("institutionId", "==", institutionId),
        ),
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    // Mirrors the existing `if (USE_MOCK || !institutionId || institutionId === '*') return;`
    // guard already used at every one of these call sites today.
    enabled: !USE_MOCK && !!institutionId && institutionId !== "*",
  });
}
```

`list/students/index.tsx`, `list/teachers/index.tsx`, `list/parents/index.tsx`,
and `registrations/index.tsx` each replace their own `onSnapshot` subscription
with this **one shared, cached** query, deriving their role-filtered view
client-side:

```ts
const { data: allUsers, isLoading } = useInstitutionUsers();
const students = useMemo(
  () => (allUsers ?? []).filter((u) => u.role === "student"),
  [allUsers],
);
```

This directly fixes §1.3's redundancy: four pages, one cached read (subject to
`staleTime`), instead of four independent full-collection subscriptions.

**Mutation invalidation** (needed since this is no longer a live listener):
`FormModal.tsx` already knows its `table` prop on every create/update/delete.
Since `student`/`teacher`/`parent`/`institution_admin` all write to the same
`users` collection, `FormModal`'s existing `closeModal()` (which already fires
an `onClose?.()` callback — the exact mechanism this session's photo-upload
feature used for `refreshPhoto`) is extended to also invalidate the shared
query when one of those four tables is involved:

```ts
const closeModal = () => {
  setOpen(false);
  if (["student", "teacher", "parent", "institution_admin"].includes(table)) {
    queryClient.invalidateQueries({ queryKey: ["users", institutionId] });
  }
  onClose?.();
};
```

This benefits all four consuming pages simultaneously from one place, without
each page needing its own bespoke invalidation call.

---

## 5. Phase 3 — Broader Conversion

The general pattern from Phase 2 (shared `useQuery`-wrapped `getDocs`,
`queryKey` scoped by `institutionId` and whatever else affects result
identity, invalidated from the relevant mutation's success path) is the
template for converting the rest of the app's `onSnapshot`/`getDocs`/`getDoc`
call sites, evaluated file-by-file rather than exhaustively pre-specified
here. Suggested classification criteria per page during implementation:

- **Convert to a cached query** (the default): any page whose data doesn't
  need to reflect another user's concurrent edit within seconds — which, per
  the confirmed decision, is most of the app (list pages, profile views,
  report generation, dashboards, reference-data lookups like
  `classInfoById`/`teacherSubjects` maps).
- **Leave on raw `onSnapshot`** (the confirmed exceptions): Gradebook
  (in-progress cell editing) and Attendance-taking (General/Subject
  Attendance while a register is actively being marked) — plus anything else
  discovered during implementation to have a similar genuine concurrent-edit
  requirement, documented explicitly as a new exception rather than silently
  left unconverted.
- **`useInstitutionAcademicCalendar()`** (§1.4) is a good early Phase 3
  target given its 12-file fan-out — but note its consumers include both
  "convert" candidates (ClassForm, dashboards) and a confirmed exception
  (Attendance pages), so the hook itself likely needs to keep serving live
  data (or be split: a cached version for the convert candidates, the
  existing live version retained specifically for Attendance).

**Mutation invalidation convention, generalized**: every `FormModal`-driven
`table` maps to one or more `queryKey`s it should invalidate on close,
extending §4's pattern into a small lookup table inside `FormModal.tsx`
rather than four hardcoded table names. Mutations that don't go through
`FormModal` (e.g. bespoke forms, bulk imports, the registration
conversion flow) get their own explicit `queryClient.invalidateQueries()`
call at their existing success path.

---

## 6. Explicitly Out of Scope

- **Persisting the TanStack Query cache across page reloads**
  (`@tanstack/query-sync-storage-persister` or similar). In-memory-only
  (the library's default) is simplest and safest for this first pass — a
  reload-persisted cache would need the same clear-on-logout discipline
  `filterPersistence.ts` already applies to `sessionStorage` (`CurrentTermContext`),
  and introducing that is a separate, deliberate decision, not a default.
- **A custom `onSnapshot`-to-query-cache bridge** for the confirmed
  exceptions (Gradebook, Attendance-taking). Since those stay on plain
  `onSnapshot`, no bridge is needed for this version.
- **Any Firestore security rules changes** — this spec only changes _how_ the
  client reads data it was already permitted to read, never _what_ it's
  permitted to read.
- **Exhaustively cataloging all 123 call sites' conversion status up front**
  — Phase 3 is intentionally evaluated incrementally against the criteria in
  §5, not pre-assigned file-by-file in this document.

---

## 7. Implementation Order

1. **Phase 0** — persistent local cache (§2). Isolated, one file, ship
   independently of everything else.
2. **Phase 1** — install dependencies, `queryClient.ts`, mount
   `QueryClientProvider` (§3). No behavior change yet — nothing consumes it.
3. **Phase 2 pilot** — `useInstitutionUsers()` + the four consuming list
   pages + `FormModal`'s invalidation extension (§4). Validates the whole
   pattern (query key design, `enabled` gating, invalidation-on-mutation) on
   a bounded, already-understood redundancy before touching anything else.
4. **Phase 3** — broaden conversion page by page per §5's criteria,
   `useInstitutionAcademicCalendar()` early given its fan-out.
5. **Devtools** — mount `@tanstack/react-query-devtools` in dev mode once
   there's meaningful cache state to inspect (naturally falls after step 3).

---

## 8. Testing / Manual QA Plan

- Phase 0 alone: confirm no functional regression across the app (persistence
  changes caching behavior, not data shape or read results) — this is a pure
  regression pass.
- Phase 2 pilot: confirm Students/Teachers/Parents/Registrations all still
  show correct, role-filtered data; confirm creating/editing/deleting a
  student, teacher, parent, or institution_admin via `FormModal` correctly
  refreshes all four pages' views (not just the page the edit was made from).
- Mock Data mode (`USE_MOCK`): confirm the `enabled` gating correctly skips
  all converted queries, matching today's existing behavior exactly (no
  regression to the 3-state dev data mode toggle).
- Gradebook and Attendance-taking (the confirmed exceptions): confirm these
  remain untouched and still fully live/real-time after the surrounding
  pages are converted.
- Spot-check Firestore usage in the Firebase Console before/after Phase 2,
  over a session that navigates Students → Teachers → Parents → back to
  Students, to confirm the expected read-count reduction is real, not just
  theoretical.

---

## Sources

- [Access data offline | Firestore](https://firebase.google.com/docs/firestore/manage-data/enable-offline) — persistent local cache API, resume-token delta-billing behavior, browser support.
- [invertase/tanstack-query-firebase](https://github.com/invertase/tanstack-query-firebase) — package source (`useCollectionQuery.ts`, `useDocumentQuery.ts`), hook inventory, peer dependencies.
- [react-query-firebase.invertase.dev](https://react-query-firebase.invertase.dev/) — package overview/marketing copy (caching claim confirmed independently via source, not taken at face value).
- npm registry (`@tanstack-query-firebase/react`) — version history and peer dependency metadata.
