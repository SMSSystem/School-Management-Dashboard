# Firestore Read Caching & TanStack Query Adoption — Spec

## Overview

The app has grown to **279 direct Firestore read call sites across 66 files**
(81 `onSnapshot` listeners in 45 files, 139 `getDocs` in 48 files, 59 `getDoc`
in 30 files — an exhaustive, file-by-file inventory; see §12) with **no local
caching configured at all** (`initializeFirestore` runs on Firestore's default
memory-only cache).
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

> **Update 2026-10 (issue #51):** the persistent IndexedDB cache described below was
> replaced by an in-memory cache with an LRU collector, because it kept every document
> a user read on the device after sign-out. Delta billing still applies **within a
> session** (the LRU collector keeps resume tokens); it no longer survives a page
> reload. Reference data is restored after a reload from the allow-listed, per-user
> `sessionStorage` cache (`src/lib/queryPersistence.ts`).

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

> **Superseded (issue #51):** this phase was later reversed — `src/lib/firebase.ts` now uses
> `memoryLocalCache` with an LRU collector. The persistent-cache code below is kept as history.

Do this regardless of any decision about TanStack Query. Touches one file,
benefits all 279 call sites uniformly, and is the direct fix for §1.2's
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
call sites. §12's exhaustive catalog replaces the earlier "evaluated
file-by-file, not pre-specified" framing — every one of the 279 call sites is
now classified there. This section gives the classification criteria and the
single biggest finding that came out of applying them.

- **Convert to a cached query** (the default): any read whose data doesn't
  need to reflect another user's concurrent edit within seconds — which, per
  the confirmed decision, is most of the app.
- **Leave fresh, uncached** (the confirmed exceptions — see §5.2 for exactly
  which call sites this means in practice, since it's narrower than "every
  read in the Gradebook/Attendance files"): the actual live grade-grid data
  and the actual live in-progress attendance register.
- Mutation invalidation, generalized: every `FormModal`-driven `table` maps
  to one or more `queryKey`s it should invalidate on close, extending §4's
  pattern into a small lookup table inside `FormModal.tsx` rather than four
  hardcoded table names. Mutations that don't go through `FormModal` (bespoke
  forms, bulk imports, the registration conversion flow) get their own
  explicit `queryClient.invalidateQueries()` call at their existing success
  path.

### 5.1 The biggest finding: reference-data dropdowns, not the users collection, are the largest redundancy

The exhaustive catalog (§12) surfaced something bigger than the original
users-collection pilot. Five small, slow-changing, **unfiltered** reference
collections — `terms`, `classes`, `subjects`, `departments`, `houses` — are
each independently read by dropdown-population code in **dozens of files**,
almost always with the exact same query shape (no `where()`/`orderBy()` at
all, just "give me everything"):

| Collection | Independent dropdown/reference reads across the app |
|---|---|
| `terms` | ~19 files (every form with a Term field, every list page with a term filter, `CurrentTermContext`, `useInstitutionAcademicCalendar`) |
| `classes` | ~19 files (every form with a Class field, every attendance page, several dashboards) |
| `subjects` | ~14 files (role-scoped for `regular_teacher` via `teacherIds array-contains`, unfiltered otherwise — see the gotcha in §7.2) |
| `departments` | 2 files |
| `houses` | 4 files |

This is a bigger, cheaper, lower-risk win than the original Phase 2 pilot: a
handful of shared hooks —
`useInstitutionTerms()`/`useInstitutionClasses()`/`useInstitutionSubjects()`/
`useInstitutionDepartments()`/`useInstitutionHouses()` — following the exact
`useInstitutionUsers()` pattern from §4, collapse **roughly 55+ individual
call sites down to 5 shared cached queries**. Recommended as **Phase 3a**,
ahead of the rest of Phase 3, precisely because these are pure reference-data
lookups with no realtime requirement anywhere in their consumer list (unlike
`users`, no page needs live cross-user updates on "what terms exist").

The `subjects` case takes the caller's role into account too, but — see the
§7.2 correction — this is a UX/data-minimization choice preserving existing
per-file behavior, not a rule requirement the way it is for `users`: the
`subjects` read rule has no role-dependent clause, so an unfiltered query is
permitted for every role. `useInstitutionSubjects()` still role-branches for
regular_teacher to match what those consumers already did; a second hook,
`useAllInstitutionSubjects()`, covers consumers that need every subject
regardless of viewer role.

### 5.2 The confirmed exceptions, precisely

The exhaustive catalog (§12) shows the "stays live/fresh" decision is
narrower than "the whole Gradebook or Attendance file":

- **Gradebook** (`list/gradebook/index.tsx`): its actual grade-grid data
  (`loadGradebook`'s students/results/columns/gradebook-doc reads,
  `reloadResults` after a save) is **already** `getDocs`, not `onSnapshot` —
  loaded on class/subject/term selection, not live-subscribed. There's
  nothing to "leave on `onSnapshot`" here; the real requirement is **don't
  wrap these specific reads in a stale-tolerant cache** (use `staleTime: 0`
  or skip TanStack Query for them entirely), so a reselect or a post-save
  reload never serves data older than the admin's own edit. Gradebook's
  *dropdowns* (term/class/subject) are ordinary Phase 3a reference-data
  conversion candidates, not part of this exception.
- **Attendance-taking, in progress**: specifically the two `onSnapshot`
  listeners showing the *current week's already-saved register state* while
  a teacher is marking it — `attendance/general/index.tsx:215-226`
  (`generalAttendance`, `where(classId, date>=weekStart, date<=weekEnd)`) and
  `attendance/subject/index.tsx:314-321` (`subjectAttendance`, equivalent
  `sessionDate` range). Everything else in those two files (class/subject
  dropdowns, the enrolled-students roster, `AttendanceScopeModal`,
  `AttendanceChart`, `attendance/gridsheet` and `attendance/my`/`child`'s
  read-only history views) is a Phase 3 conversion candidate — none of it is
  "in progress," it's either reference data or a historical/summary read.

---

## 6. Persisting the Cache Across Reloads

Confirmed decision: persist across page reloads, backed by **sessionStorage**
(not `localStorage`) — survives reloads within a tab, clears automatically on
tab/browser close as a safety net even if the explicit sign-out clear were
somehow missed, and matches this app's existing sessionStorage-based
filter-persistence convention (`filterPersistence.ts`).

Packages (both `5.103.2`, aligned with `@tanstack/react-query`'s own latest —
confirmed via the npm registry):

```
npm install @tanstack/react-query-persist-client @tanstack/query-sync-storage-persister
```

```ts
// src/lib/queryClient.ts — extends §3's QueryClient setup
import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

const persister = createSyncStoragePersister({
  storage: window.sessionStorage,
  key: 'sms_query_cache', // matches filterPersistence.ts's sms_filter_ naming convention
});

persistQueryClient({
  queryClient,
  persister,
  // A restored-from-storage cache older than this is discarded outright
  // rather than served stale-then-revalidated — matches Firestore's own
  // 30-minute resume-token delta-billing window (§1.2), so a reload within
  // that window benefits from both mechanisms together, and a reload after
  // it behaves as a clean cold start either way.
  maxAge: 30 * 60 * 1000,
});
```

**Clear-on-logout**: extends the existing sweep rather than adding a parallel
one. `AuthContext.signOut()` already calls `clearAllPersistedFilters()`
(§1's `filterPersistence.ts`) — add `queryClient.clear()` alongside it:

```ts
// src/lib/AuthContext.tsx — signOut(), extending the existing calls
async function signOut() {
  sessionStorage.removeItem(SESSION_SIGNIN_KEY);
  clearAllPersistedFilters();
  queryClient.clear(); // NEW — also wipes the persisted sessionStorage copy, since
                        // the persister's storage adapter IS sessionStorage: clearing
                        // the in-memory cache and letting the persister's own
                        // subscription sync that clear to storage keeps one source of
                        // truth, rather than manually removing the sessionStorage key
                        // in two places.
  await firebaseSignOut(auth);
}
```

`queryClient.clear()` triggers the persister's normal save-on-change behavior
(clearing its sessionStorage entry to match the now-empty cache), so no
separate manual `sessionStorage.removeItem()` call is needed — one clear
operation, one source of truth, consistent with how `clearAllPersistedFilters()`
itself is already the single sweep point for the app's other sessionStorage
state.

---

## 7. Firestore Security Rules — Investigation

**Headline finding: the Phase 2 pilot and Phase 3a's reference-data hooks need
zero rule changes.** This migration changes *how often* and *from where* the
client reads data it was already permitted to read — never *what* it's
permitted to read — for every collection this spec actually touches.
Confirmed by reading the rule blocks directly:

```
// users/{uid} — firestore.rules
allow read: if isOwner(uid)
  || (isAdminOrAbove() && sameInstitution(resource.data.institutionId))
  || (isTeacher() && sameInstitution(resource.data.institutionId) && resource.data.role == 'student');

// classes/{classId}, subjects/{subjectId}, terms/{termId}, academicYears/{yearId} —
// all four share this identical shape:
allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
```

`classes`/`subjects`/`terms`/`academicYears` are read-permitted for **any**
signed-in same-institution user regardless of role — §5.1's shared reference
hooks need no rule changes for any caller. `users` is read-permitted for
`institution_admin`/`super_admin` regardless of role-of-the-document-being-read
— exactly what §4's pilot already relies on, and those pages are already
admin-only gated client-side.

### 7.1 The real gotcha: "security rules are not filters"

Confirmed via Firebase's own documentation (see Sources): **"Security rules
are not filters — queries are all-or-nothing. If a query could potentially
return documents the client does not have permission to read, the entire
request fails."** This applies to `list` (collection-query) requests
specifically, and behaves differently from a single-document `get`.

Applied to the `users` rule's teacher clause — `isTeacher() && ... &&
resource.data.role == 'student'` — that clause depends on `resource.data`,
so Firestore can't prove an *unfiltered* query is safe for a teacher caller;
the query itself must include `where('role', '==', 'student')` for the rule
engine to accept it. A teacher running the pilot's unfiltered
`useInstitutionUsers()` shape would get the **entire request rejected**, not
a role-filtered result.

**Not a blocker for anything in this spec** — every current consumer of the
unfiltered `users` shape (§4's pilot, and every place in §12's catalog
reading `users` without a role filter) is already `institution_admin`/
`super_admin`-only. It **is** a hard constraint on ever generalizing
`useInstitutionUsers()` to a teacher-facing page later: that would need a
second, role-branching query shape, not client-side filtering of the same
shared cache entry.

### 7.2 CORRECTED during Phase 3a implementation: `subjects` does NOT have the same gotcha

This section originally claimed `subjects` had an identical
resource.data-dependent regular_teacher clause to `users`, requiring the
same in-query `where('teacherIds', 'array-contains', uid)` role-branching.
That claim was **wrong** — verified directly against `firestore.rules`
during the Phase 3a subjects conversion, both the flat `/subjects/{id}` rule
(line ~301) and the nested `/institutions/{institutionId}/subjects/{id}`
rule the app actually queries (line ~935): both are
`allow read: if isSignedIn() && inMyInstitution(institutionId);` — no
role-dependent clause at all, unlike `users`' teacher clause. An unfiltered
subjects query from a regular_teacher is permitted by the rule; it is never
rejected.

The `teacherIds array-contains` filtering present throughout the codebase
(`ResultForm.tsx`, `FeedbackCommentForm.tsx`, `AssignmentForm.tsx`,
`ExamForm.tsx`, Gradebook, `list/results`, the Spreadsheet Import helpers)
is a **data-minimization/UX choice** — "only show subjects I teach" — not a
security necessity. `useInstitutionSubjects()` (§5.1) still preserves this
filtering behavior for regular_teacher, since it matches what most existing
consumers already did and there's no reason to regress their UX, but a
second hook, `useAllInstitutionSubjects()`, was added for the consumers that
genuinely need every subject regardless of viewer role — resolving any
subject's name for display (`list/results`' name-lookup listener), or an
admin-only "assign subjects to this teacher" checklist (`TeacherForm.tsx`) —
which the rule has always permitted for every role.

### 7.3 One caveat unrelated to this migration, but relevant to trusting this analysis

`firestore.rules` (~lines 292–299) has an existing comment documenting that
part of the `subjects`/`results`/`feedback_comments` rule set already
references a nested path the app code doesn't write to yet, specifically
because that batch of rules changes is deliberately **undeployed** pending
the institution-nesting overhaul's cutover. The committed rules file and
what's actually live in the Firebase Console may already be out of sync,
independent of anything in this spec. Confirm current deployed-rules state
before treating this section's analysis as a guarantee of production
behavior, rather than of what the committed file says.

---

## 8. Firebase Indexes — Judgment

**General principle**: index requirements are driven by query *shape*
(`where()`/`orderBy()` combinations), not by read *frequency* or *mechanism*
(`onSnapshot` vs. cached `getDocs`). Since this migration is designed to keep
query shapes identical for the vast majority of conversions (§4, §5.1), **no
new indexes are needed** for Phase 0 through Phase 3a.

**Existing indexes, checked against §12's catalog**: `firestore.indexes.json`
has three `users` composite indexes — `institutionId+role+classId`,
`institutionId+role+institutionStudentId`, `institutionId+idNumber`. Traced
to `AdminCreateUserForm.tsx`'s and `import/index.tsx`'s pre-write
**uniqueness-check** queries (student-ID/citizen-ID collision checks) — a
categorically different use case from the display reads this spec targets,
run once at write time rather than repeatedly at render time. Both stay as
direct, uncached, one-off `getDocs` calls regardless of how far this
migration goes (a cached uniqueness check would be actively wrong — it must
always hit the server). **These three indexes are unaffected by this
migration at every phase.**

**Where indexes *could* eventually become orphaned (never newly required)**:
if a future phase ever consolidates one of §12's already-narrower
role-filtered queries (e.g. a page currently doing
`where(institutionId==)+where(role==)+orderBy(classId)`) into the shared
broad-read-then-client-filter pattern, the narrower query's composite index
stops being hit by anything — safe to prune later, never a reason to add one,
since a broader consolidated query is never more constrained than what it
replaces.

**A related optimization, adjacent to but outside indexing**: `UserCard.tsx`
(the dashboard's "Students/Teachers/Parents (total)" count tiles, §12) is
currently a full `onSnapshot` reading every matching document just to display
a count. `@tanstack-query-firebase/react` ships
`useGetCountFromServerQuery`/`useGetAggregateFromServerQuery`, wrapping
Firestore's native aggregate-count API — billed far more cheaply than reading
every document. Not part of the original ask, but a natural "while you're in
there" candidate worth including in Phase 3.

---

## 9. Explicitly Out of Scope

- **A custom `onSnapshot`-to-query-cache bridge** for the confirmed
  exceptions (§5.2's two live-register listeners and Gradebook's
  must-stay-fresh grade-grid reads). Since those stay exactly as they are
  today, no bridge is needed.
- **Any change to what data any role is permitted to read.** §7 confirms
  this migration only changes *how* already-permitted reads happen, never
  *what's* permitted — no rule loosens or tightens as a result of this spec.
- **Deleting the three uniqueness-check-only `users` composite indexes**
  (§8) — confirmed unaffected by this migration; any future removal is a
  separate decision, unrelated to this spec.
- **Renaming/restructuring `useInstitutionAcademicCalendar()`** itself.
  §5.1's reference-data hooks (`useInstitutionTerms()` etc.) are new,
  parallel hooks for dropdown/reference consumers — this spec doesn't
  redesign the existing calendar hook, which keeps serving its 12 current
  consumers (§1.4) exactly as it does today.

---

## 10. Implementation Order

1. **Phase 0** — persistent local cache (§2). Isolated, one file, ship
   independently of everything else.
2. **Phase 1** — install dependencies, `queryClient.ts`, mount
   `QueryClientProvider` (§3). No behavior change yet — nothing consumes it.
3. **Phase 1b** — cross-reload persistence + the `signOut()` clear-on-logout
   extension (§6). Bundled with Phase 1 since it's the same `queryClient.ts`
   file and the same "nothing consumes it yet" state.
4. **Phase 2 pilot** — `useInstitutionUsers()` + the four consuming list
   pages + `FormModal`'s invalidation extension (§4). Validates the whole
   pattern (query key design, `enabled` gating, invalidation-on-mutation,
   the persisted-cache round-trip) on a bounded, already-understood
   redundancy before touching anything else.
5. **Phase 3a** — the reference-data hooks (§5.1): `useInstitutionTerms()`,
   `useInstitutionClasses()`, `useInstitutionSubjects()` (with role
   branching, §7.2), `useInstitutionDepartments()`, `useInstitutionHouses()`.
   Highest remaining call-site-count reduction, lowest risk (no realtime
   requirement anywhere in scope, confirmed by §12).
6. **Phase 3** — the rest of §12's "convert" classification, page by page.
7. **Index cleanup** (§8) — only after Phase 3a/3 have actually shipped and
   run long enough to confirm which narrower queries, if any, were fully
   superseded; never speculative, never blocking any earlier step.
8. **Devtools** — mount `@tanstack/react-query-devtools` in dev mode once
   there's meaningful cache state to inspect (naturally falls after step 4).

---

## 11. Testing / Manual QA Plan

- Phase 0 alone: confirm no functional regression across the app (persistence
  changes caching behavior, not data shape or read results) — this is a pure
  regression pass.
- Phase 1b: sign in, let queries populate the cache, reload the page,
  confirm previously-loaded data renders instantly from the persisted cache;
  sign out, confirm the sessionStorage key is gone and a fresh sign-in starts
  cold (no cross-account data leakage).
- Phase 2 pilot: confirm Students/Teachers/Parents/Registrations all still
  show correct, role-filtered data; confirm creating/editing/deleting a
  student, teacher, parent, or institution_admin via `FormModal` correctly
  refreshes all four pages' views (not just the page the edit was made from).
- Phase 3a: confirm every dropdown previously fed by an independent
  per-file query still populates correctly across all ~55+ consumer files;
  confirm a `regular_teacher` still only sees their own subjects (role
  branching, §7.2) and isn't hit with a permission-denied error (§7.1's
  gotcha, if the branching were ever dropped).
- Mock Data mode (`USE_MOCK`): confirm the `enabled` gating correctly skips
  all converted queries, matching today's existing behavior exactly (no
  regression to the 3-state dev data mode toggle).
- The confirmed exceptions (§5.2): confirm Gradebook's grade-grid data and
  both attendance registers' live-marking listeners remain untouched and
  still fully fresh/real-time after the surrounding pages are converted.
- Spot-check Firestore usage in the Firebase Console before/after Phase 2
  and Phase 3a, over a session that navigates Students → Teachers → Parents
  → back to Students (Phase 2) and opens several forms with Term/Class/
  Subject dropdowns (Phase 3a), to confirm the expected read-count reduction
  is real, not just theoretical.

---

## 12. Exhaustive Call-Site Catalog

Every one of the 279 call sites (81 `onSnapshot`, 139 `getDocs`, 59 `getDoc`,
across 66 files), grouped by collection — the natural grouping, since one
shared query per collection+scope-key serves many of these at once. Classified
as **Convert** (the default — safe to move to a cached query per §5's
criteria), **Exception** (§5.2's two precise live-register listeners plus
Gradebook's must-stay-fresh grade-grid reads), or **Unaffected** (already a
correctly-scoped one-off read with no caching upside — uniqueness checks,
admin maintenance-tool batch jobs, import-tool helpers, upsert-lookups that
must always hit the server).

Full raw inventory (file, line, query shape, effect-vs-one-off, and what each
read feeds) generated by a dedicated pass over all 66 files — reproduced in
full in `docs/miscellaneous-specs/FIRESTORE_READ_CACHING_CALL_SITE_INVENTORY.md`
rather than inline here, since it runs well beyond what's readable as prose
in the middle of an already-long spec.

### 12.1 By collection — classification summary

| Collection | Convert | Exception | Unaffected | Notes |
|---|---|---|---|---|
| `users` (collection queries) | Most — §4 pilot + all role-filtered dropdown/lookup reads | None | Uniqueness checks (`institutionStudentId`/`idNumber`/homeroom-conflict), upsert-lookups | Teacher-role queries must keep their `where('role', ...)` clause in-query (§7.1) |
| `users/{uid}` (single doc) | Prefill reads, tour-gate checks, `useSeniorTeacherProfile` | None | — | `AuthContext`'s own fetches are a separate, already-optimal pattern (once per auth-state-change) |
| `users/{uid}/photo/current` | Detail-page avatars | None | The bounded per-page `fetchPhoto`/`requestedPhotoUids` pattern (already deliberately not `onSnapshot` — see its own in-code comment) | Already a hand-rolled cache; a Phase 3+ candidate for replacing with a shared query, not urgent |
| `institutions/{id}` | Most — brand data, settings, dropdowns | None | — | `AuthContext`'s own fetch is once-per-auth-change, already optimal |
| `student_parents` | Most | None | — | `useLinkedStudentIds` is already the canonical reusable hook; several files re-implement the same query inline instead of calling it — a good Phase 3 sub-target even before touching caching |
| `registration_directory` | Most | None | — | `lib/registrationDirectory.ts` already has a module-level in-flight-promise cache — a hand-rolled precedent for exactly this migration |
| `terms`, `classes`, `subjects`, `departments`, `houses` | **All dropdown/reference reads — see §5.1** | The 3 list-table pages showing live CRUD state (`list/terms`, `list/classes`, `list/subjects`, `list/houses` themselves) are lower-priority but reasonable Phase 3 (not 3a) candidates, not exceptions | — | §5.1's headline finding |
| `academicYears`, `nonSchoolDays` | Most | `useInstitutionAcademicCalendar()` itself stays live (§1.4, unchanged by this spec — see §9) | Academic Calendar wizard's own edit/delete flows (inherently need fresh data) | — |
| `exams`, `assignments`, `lessons`, `events`, `announcements` | List-table pages — Convert | None | — | Simple, unfiltered, low-risk |
| `results`, `feedback_comments`, `reportCards`, `reportCardComments`, `progressReports`, `disciplinaryActions`, `studentActivities`, `studentResponsibilities` | Student/parent/staff view listeners — Convert | None | `generateReportCard.ts`/`generateProgressReport.ts`'s one-off reads (inherently single-use, generation-time only) | Role-scoped shapes (`studentId==`, `in [...]` for parents) carry over unchanged into the cached version |
| `attendanceSummaries` | — | — | `generateReportCard.ts`'s single read | Write-only elsewhere |
| `generalAttendance`, `subjectAttendance` | Dropdowns, rosters, history views (`attendance/my`, `attendance/child`, `AttendanceChart`, `AttendanceScopeModal`, `gridsheet`) — Convert | **The two precise live-register listeners, §5.2** | Rebuild-tool and import-helper reads (inherently one-off) | — |
| `subjectEnrollments`, `timetable_slots`, `gradebooks`/`columns` | Most | Gradebook's grade-grid reads (§5.2) | Scheduling-conflict checks (`TimetableSlotForm`'s `onSubmit`) | — |
| `enrollmentRegistrations` | The live review table — Convert | None | — | Low risk; admin review workflow, not collaborative editing |
| `audit_log` (direct + `collectionGroup`) | Most | None | — | Already `limit()`-bounded, low volume |

Scripts under the repo-root `scripts/` directory (seed/backfill/teardown) use
the Admin SDK directly, not the client patterns searched for — confirmed zero
matches, explicitly out of scope regardless (they're not part of the deployed
React app).

---

## Sources

- [Access data offline | Firestore](https://firebase.google.com/docs/firestore/manage-data/enable-offline) — persistent local cache API, resume-token delta-billing behavior, browser support.
- [Securely query data | Firestore](https://firebase.google.com/docs/firestore/security/rules-query) — "security rules are not filters" / `list` vs. `get` query behavior (§7.1).
- [invertase/tanstack-query-firebase](https://github.com/invertase/tanstack-query-firebase) — package source (`useCollectionQuery.ts`, `useDocumentQuery.ts`), hook inventory, peer dependencies.
- [react-query-firebase.invertase.dev](https://react-query-firebase.invertase.dev/) — package overview/marketing copy (caching claim confirmed independently via source, not taken at face value).
- npm registry (`@tanstack-query-firebase/react`) — version history and peer dependency metadata.
