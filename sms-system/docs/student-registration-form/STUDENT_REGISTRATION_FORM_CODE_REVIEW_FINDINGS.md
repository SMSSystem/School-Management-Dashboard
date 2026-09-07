# Student Registration Form — Code Review Findings

> **Reviewed:** 2026-08-20
> **Branch:** `registration-form`
> **Scope:** Registration-form commits only (`ad2dd51~1..registration-form`) — 19 files, +5474/-31. Excludes 3 unrelated pre-existing commits at the base of the branch (exam conflict-confirm fix, ExamForm/AssignmentForm defaultValues fix, report-card MDDS fix).
> **Method:** `/code-review high`, 8 parallel finder agents (Conventions, Reuse, Efficiency, Altitude, Simplification, Angle A line-by-line, Angle B removed-behavior, Angle C cross-file tracer) run against the diff.
> **⚠️ Verification pass skipped per request.** Normally each finding goes through a second pass that re-checks it against the actual code before being reported, to filter out false positives. That pass did not run for this list — treat every item below as an unconfirmed lead, not a settled fact, until a future pass checks it against the code. Two items (see #8) were reported independently by two separate agents, which is a reasonable signal they're real, but nothing here has been formally verified.

**Status key:** Not started · In progress · Fixed · Won't fix

---

## Correctness / Security

Likely worth fixing before the PR — these touch the app's one public unauthenticated write path, its security rules, or a workflow that was specifically built this session to fix a prior bug.

- [x] **1. Validation drift between the Zod schema and Firestore rules**
  **Files:** `src/scenes/(auth)/register/[institutionId]/index.tsx`, `firestore.rules:120-138`
  **Status:** Fixed (partially — scoped deliberately, see below)
  The minimum-age check and phone-format regex only exist client-side; the rules' own comment calls itself "the actual bypass-resistance," but a direct API write can submit a newborn's date of birth or garbage phone data past it. The rules also use a weak `email.matches('.*@.*')` versus Zod's real `.email()`.
  **Resolution:** the minimum-age check was left client-only, deliberately — it was already an explicit, documented decision made earlier this session (see `STUDENT_REGISTRATION_FORM_SPEC.md` §Registration Form Fields → Client-side validation, sanitization, and formatting), not an oversight the review agent had context on. Fixed the two genuinely-unmirrored checks instead: `guardian.contact` now requires `firestore.rules`' regex to match the registration form's `phonePattern` exactly (`^\+?[0-9 ()-]{7,20}$`), and both `student.email`/`guardian.email` now require `^[^@\s]+@[^@\s]+\.[^@\s]+$` instead of the old bare `.*@.*` — a much closer (though not exact) mirror of Zod's `.email()`. **Deployed** to `school-sms-v1` via `npm run firebase:deploy:rules` — compiled and released successfully.

- [x] **2. No `hasOnly()` on the `enrollmentRegistrations` create rule**
  **File:** `firestore.rules:1257-1270`
  **Status:** Fixed
  Only `hasAll()` is checked, so a scripted client can attach an arbitrary extra field (e.g. a near-1MiB junk string) that sails through untouched, defeating the size-cap hardening the surrounding comments claim to provide.
  **Resolution:** the create rule now checks both `hasAll()` and `hasOnly()` against the exact 9-key set the client actually writes (`institutionId`, `academicYearId`, `academicYearName`, `status`, `submittedAt`, `possibleDuplicate`, `student`, `mother`, `father`), pinning the document shape precisely instead of only requiring a subset. This also made the 5 negative checks (`!('convertedStudentUid' in data)` etc.) provably dead code, so they were removed — resolving **Item 26** at the same time. Also closed a related gap found while building the exact key list: `submittedAt` had zero rule-side validation before this (not even presence), now requires `is timestamp`. **Deployed** to `school-sms-v1` via `npm run firebase:deploy:rules` — compiled and released successfully.

- [ ] **3. Guardian `work` and student `middleName`/`lastSchoolAttended` are unvalidated in rules**
  **File:** `firestore.rules:120-138` (`isValidRegistrationStudent`/`isValidRegistrationGuardian`)
  **Status:** Fixed
  No type or size check on these optional fields, unlike every other field in the same functions.
  **Resolution:** `middleName`/`lastSchoolAttended` (student) and `work` (guardian) now get the same `(!('x' in obj) || (obj.x is string && obj.x.size() <= N))` presence-or-valid check as every other field, using the same size caps the Zod schema already enforces (100/200/100). Also went further than the literal finding: added `hasOnly()` to both functions (matching Item 2's top-level fix), since a bypass client could otherwise still stuff an oversized junk field inside `student:{...}`/`mother:{...}` one level deeper than Item 2's top-level check reaches. **Deployed** to `school-sms-v1` via `npm run firebase:deploy:rules` — compiled and released successfully.

- [x] **4. `submittedAt` isn't pinned in the update rule**
  **File:** `firestore.rules:1272-1290`
  **Status:** Fixed
  The rule's comment claims "the submitted family data itself is immutable once submitted," but `submittedAt` isn't compared against `resource.data.submittedAt`. An admin (buggy client or compromised session) can silently rewrite it, corrupting the audit trail and the review page's date sort.
  **Resolution:** added `request.resource.data.submittedAt == resource.data.submittedAt` to the update rule's pinned-fields list. Also found and fixed a sibling gap while tracing this rule: `academicYearName` had the same problem (only `academicYearId` was pinned, not the denormalized name alongside it) — added `request.resource.data.academicYearName == resource.data.academicYearName` too. **Deployed** to `school-sms-v1` via `npm run firebase:deploy:rules` — compiled and released successfully.

- [x] **5. `possibleDuplicate` has no type constraint on update**
  **File:** `firestore.rules:1272-1274` vs `:1257-1259`
  **Status:** Fixed
  The create rule requires `== false` (must be boolean); the update rule places no constraint at all. Could be set to a non-boolean, breaking every consumer that assumes boolean.
  **Resolution:** added `request.resource.data.possibleDuplicate is bool` to the update rule — allows either boolean value (unlike create's fixed `== false`, since this is where the reviewing admin's client actually sets it), but must be a boolean. **Deployed** to `school-sms-v1` via `npm run firebase:deploy:rules` — compiled and released successfully.
  **Related, tracked separately:** while scoping this, found the update rule has no `hasOnly()`/field-allow-list at all — unlike create (Items 2/3), an admin update could smuggle in an arbitrary new top-level field alongside a legitimate change. Deliberately kept out of this fix (bigger task — needs to correctly enumerate every field every legitimate update path touches: plain status transition, review, duplicate-flagging, conversion). See **Item 29** below.

- [x] **6. `ConvertToAccountsPanel.persistStep` has no try/catch**
  **File:** `src/scenes/(dashboard)/registrations/ConvertToAccountsPanel.tsx:51-80`
  **Status:** Fixed
  If any write fails mid-step (after the Firebase Auth account was already created), the modal is stuck on "Saving…" forever with no error message and no way to retry or cancel.
  **Resolution:** split the write logic (`persistStep`) from the state-management wrapper (`attemptStep`), which now wraps the call in try/catch. On failure it shows an error screen with **Retry** and **Close** — Retry re-attempts the exact same step with the already-known uid (stored in a new `lastAttempt` state) rather than going back through `AdminCreateUserForm`, which would otherwise try to recreate the same Firebase Auth account and fail with "email already in use." All three writes inside `persistStep` are safe to retry from scratch (deterministic `setDoc` ID, fixed-value `updateDoc`, and the audit-log `addDoc` only ever runs after the writes before it succeeded), so a blanket retry-the-whole-step is correct in every failure sub-case. `tsc`/`eslint`/the 84-test suite all pass — no test coverage added since this component has no existing test file (matches this repo's established pattern of component-level UI logic going untested; only pure functions get unit tests here).

- [x] **7. Stale `selected` state defeats the per-step persistence fix**
  **Files:** `src/scenes/(dashboard)/registrations/index.tsx:92` (state) + `ConvertToAccountsPanel.tsx:31-35,104,118,133`
  **Status:** Fixed
  `selected` is set once on row click and never re-synced from the live `onSnapshot` data. Reopening "Convert to accounts" after a partial conversion can show the already-created student account as still needing creation (checkbox unchecked/enabled instead of disabled/"already created"), leading to a retry that fails with "email already in use" — exactly the failure mode the per-step-persist design (added this session, following an explicit scope decision reached via a clarifying question) was meant to prevent.
  **Resolution:** replaced the `selected: Registration | null` state with `selectedId: string | null`, and derive `selected` via `useMemo(() => registrations.find(r => r.id === selectedId), [registrations, selectedId])` — a standard "don't snapshot state that already has a live source of truth" fix. `selected` now automatically reflects whatever `onSnapshot` last delivered, including `ConvertToAccountsPanel`'s own writes, instead of freezing whatever was true at the moment the row was clicked. All `setSelected(...)` call sites updated to `setSelectedId(...)`. `tsc`/`eslint`/the 84-test suite all pass.

- [x] **8. `RegistrationDirectoryToggle.tsx` `null` vs `undefined` comparison**
  **File:** `src/components/RegistrationDirectoryToggle.tsx:52` (writes at `:58` and `:84`)
  **Status:** Fixed
  **Found independently by two separate agents (Angle A and Angle C)** — higher confidence this is real. `entry.logoUrl !== (institution.logoUrl ?? undefined)` compares Firestore's stored `null` against JS's `undefined`, which are never `===`/`!==`-equal. For any institution with no logo, this is always `true`, so the "keep fresh" effect fires a redundant `setDoc` write on every visit even when nothing changed.
  **Resolution:** normalized both sides of the comparison to the same `null` sentinel — `(entry.logoUrl ?? null) !== (institution.logoUrl ?? null)` — matching the exact convention both write sites in this file already use (`logoUrl: institution.logoUrl ?? null`). `tsc`/`eslint`/the 84-test suite all pass.

- [x] **9. Already-signed-in redirect guard not extended to `/register`**
  **File:** `src/App.tsx:97-98` (and routes at `:131-132`)
  **Status:** Fixed
  `isAuthRoute` was widened to also match `/register*`, but the "redirect to /dashboard if already signed in" logic was applied only to `/login`, not extended to the new `/register`/`/register/:institutionId` routes. A signed-in admin can still land on the public registration picker/form instead of being bounced to `/dashboard`.
  **Resolution:** both `/register` and `/register/:institutionId` now get the exact same `!loading && user ? <Navigate to="/dashboard" replace /> : <Component />` guard `/login` already uses. Per the clarifying-question decision, this redirects *any* signed-in user unconditionally (matching `/login` exactly, no admin-preview exception) rather than carving out an exception for institution_admin/super_admin to preview their own registration form while signed in — an admin who wants to preview it now needs to sign out or use a private window, same as testing any other unauthenticated flow in this app. `tsc`/`eslint`/the 84-test suite all pass.

- [x] **10. Duplicate-detection matches against `rejected`/`converted` registrations forever**
  **Files:** `src/lib/registrationDuplicates.ts:35-43`, call site `src/scenes/(dashboard)/registrations/index.tsx:112-123`
  **Status:** Fixed
  `computePossibleDuplicates` doesn't filter by status, so a legitimately resubmitted registration stays flagged "possible duplicate" against an old rejected entry indefinitely, with no way to clear the flag short of deleting the old document.
  **Resolution:** per the clarifying-question decision, scoped to exactly what the finding's own failure scenario argues, not its title — only `rejected` registrations are excluded from the match-candidate pool; `converted` ones still count as valid candidates, since a second submission for an already-enrolled student is still a meaningful signal for the reviewing admin (and this is also redundant with the separate existing-student check once that student's account exists). Added 3 new unit tests: a fresh resubmission isn't flagged against a rejected registration, a resubmission still *is* flagged against a converted one, and an existing `possibleDuplicate: true` flag correctly clears once the registration it was matching becomes rejected. `tsc`/`eslint`/the now-87-test suite all pass.

---

## Lower-severity / Cosmetic

- [x] **11. `failedAttempts` login-lockout hint resets on "Back"**
  **File:** `src/scenes/(auth)/login/index.tsx:85,163,352`
  **Status:** Fixed
  Clicking "← Back" then "Login" again unmounts/remounts `LoginFormView`, resetting the counter and losing the "too many attempts" hint. Cosmetic message only — not a real security control — but a silently reset UX signal.
  **Resolution:** lifted `failedAttempts`/`setFailedAttempts` up to the parent `LoginPage` component (which doesn't unmount when toggling between the choice screen and the login form) and passed down as props — the standard "lift state above the unmount boundary" fix. Every other field in `LoginFormView` (email, password, field errors) deliberately stays local and still resets on remount, which is the desired behavior for a password field left in a form the visitor navigated away from — only the lockout-hint counter needed to survive. `tsc`/`eslint`/the 87-test suite all pass.

- [x] **12. `ConvertToAccountsPanel` student-step `initialValues` omits `email`**
  **File:** `src/scenes/(dashboard)/registrations/ConvertToAccountsPanel.tsx:185-192` vs `AdminCreateUserForm.tsx:147-149,339`
  **Status:** Fixed
  `email` is mandatory for account creation and was already collected on the public form (and the guardian steps do prefill it), but the student step doesn't — the admin has to retype it from memory/by scrolling back to the detail panel.
  **Resolution:** added `email: registration.student.email` to the student step's `initialValues` object, matching exactly how the guardian branch already prefills its own `email` field. Unambiguous fix — no design fork, since `student.email` is a required field on every registration and `AdminCreateUserForm`'s `initialValues` already supports `email`. `tsc`/`eslint`/the 87-test suite all pass. No rules change, so no deploy needed for this item.

- [x] **13. `logRegistrationAudit`'s `eventType` isn't in the `AuditEventType` union**
  **Files:** `src/lib/firebase.ts:293-299` vs `src/scenes/(dashboard)/registrations/registrationAudit.ts:13`
  **Status:** Fixed
  `"registration_status_change"` is absent from the typed union. Silently unchecked because `institutionCollection()` returns an untyped `CollectionReference`, so `addDoc` never validates the payload against `AuditLogEntry`. A future exhaustive switch/lookup keyed on `AuditEventType` would silently mishandle registration audit rows.
  **Resolution:** added `'registration_status_change'` to the `AuditEventType` union in `firebase.ts`. Scoped to exactly what the finding's title asks — did not widen `institutionCollection()`'s return type to `CollectionReference<AuditLogEntry>`, since that's the explanatory root cause for *why* the drift went unnoticed, not a separate ask, and would touch every other caller of that helper repo-wide. `tsc`/`eslint`/the 87-test suite all pass. No rules change, so no deploy needed for this item.

---

## Reuse / Duplication

- [x] **14. `namePattern`/`phonePattern` copy-pasted from `AdminCreateUserForm.tsx`**
  **Files:** `src/scenes/(auth)/register/[institutionId]/index.tsx:13-14` vs `AdminCreateUserForm.tsx:29-30`
  **Status:** Fixed
  Byte-for-byte copies instead of a shared import. The new file's own comment admits it matches `AdminCreateUserForm.tsx` exactly — future tightening now has to happen in two places or they'll drift.
  **Resolution:** extracted both regexes into a new `src/lib/fieldPatterns.ts`, imported by both files. Per the clarifying-question decision, scoped to exactly the two files named in the finding — `ParentForm.tsx`'s own separate `phonePattern` copy was left untouched, since it predates this branch entirely and isn't part of the reviewed diff. `tsc`/`eslint`/the 87-test suite all pass. No rules change, so no deploy needed for this item.

- [x] **15. `registration_directory` query duplicated between login and register pages**
  **Files:** `src/scenes/(auth)/register/index.tsx:23-31` vs `src/scenes/(auth)/login/index.tsx:95-102`
  **Status:** Fixed
  Identical `getDocs(query(...))` + `.sort()` copy-pasted verbatim; no shared `fetchAcceptingInstitutions()` helper exists.
  **Resolution:** extracted a `fetchAcceptingInstitutions()` helper (plus the `DirectoryOption` type both files also duplicated) into a new `src/lib/registrationDirectory.ts`, matching the exact helper name the finding itself suggested. Both pages now call it and only handle their own loading-state/UI concerns. Deliberately did not add caching between the two call sites — that's the separate **Item 20**. `tsc`/`eslint`/the 87-test suite all pass. No rules change, so no deploy needed for this item.

- [x] **16. `formatDate` duplicated from `disciplinary-actions/index.tsx`; options object duplicated within the same file**
  **File:** `src/scenes/(dashboard)/registrations/index.tsx:34-38,36,50`
  **Status:** Fixed
  `formatDate` almost exactly duplicates `disciplinary-actions/index.tsx:58-64` (same epoch-noon-avoidance suffix, same options, same fallback). The same `toLocaleDateString` options object is also written out twice in this file (`formatDate` and `formatSubmittedAt`).
  **Resolution:** extracted `formatDate` and a shared `LONG_DATE_OPTIONS` constant into a new `src/lib/formatDate.ts`. Both `registrations/index.tsx` and `disciplinary-actions/index.tsx` now import `formatDate` instead of each defining their own copy, and `formatSubmittedAt` now reuses the exported `LONG_DATE_OPTIONS` instead of repeating the options object literal. `tsc`/`eslint`/the 87-test suite all pass. No rules change, so no deploy needed for this item.

---

## Efficiency

- [x] **17. Duplicate-detection effect re-fetches the entire student roster repeatedly**
  **File:** `src/scenes/(dashboard)/registrations/index.tsx:109-130`
  **Status:** Fixed
  Re-runs a full `getDocs` over every `role=="student"` user on any change to `registrations.length`, not just once — repeated full-roster reads during a busy admissions period.
  **Resolution:** per the clarifying-question decision, cached the roster per `institutionId` in a `useRef`, fetched at most once instead of on every `registrations.length` change. Accepted trade-off: a student account converted moments earlier in the same session won't be checked against until the cache is next invalidated (institution change or page reload) — a small, bounded staleness window, the same class of gap Item 10 already accepted elsewhere. Rejected the debounce option (smaller win, more moving parts) and the `onSnapshot` option (would've revisited the effect's own documented decision to avoid it here). `tsc`/`eslint`/the 87-test suite all pass. No rules change, so no deploy needed for this item.

- [x] **18. Duplicate-detection writes aren't batched**
  **File:** `src/scenes/(dashboard)/registrations/index.tsx:121-123`
  **Status:** Fixed
  Fires one `updateDoc` per changed registration sequentially instead of a single `writeBatch()` — N round trips and N extra `onSnapshot` re-renders instead of one.
  **Resolution:** replaced the per-registration `updateDoc` calls with a single `writeBatch()` commit (skipped entirely when there are no updates). Unambiguous fix, straightforward application of a pattern already used elsewhere in this codebase. `tsc`/`eslint`/the 87-test suite all pass. No rules change, so no deploy needed for this item.

- [x] **19. `computePossibleDuplicates` is O(n²+n·m), recomputed from scratch every run**
  **File:** `src/lib/registrationDuplicates.ts:28-51`
  **Status:** Fixed
  Nested `.some()` over the full registrations and students arrays every time, rather than an indexed O(n+m) lookup or incremental recompute.
  **Resolution:** per the clarifying-question decision, replaced the nested-loop scans with a one-pass `Map`/`Set` index keyed by `academicYearName|name|dateOfBirth` (registrations) and `name|dateOfBirth` (existing students) — true O(n+m), same inputs/outputs, no caching or incremental-recompute logic added. Did **not** mark Won't Fix even though realistic admissions-batch scale makes the old O(n²) cost trivial, since the indexed version isn't meaningfully more complex and costs nothing extra. All 5 existing duplicate-detection tests (including the rejected/converted-status edge cases from Item 10) pass unchanged, confirming behavior is identical. `tsc`/`eslint`/the 87-test suite all pass. No rules change, so no deploy needed for this item.

- [x] **20. `registration_directory` fetched independently on both login and register pages with no cache**
  **Files:** `src/scenes/(auth)/login/index.tsx:95`, `src/scenes/(auth)/register/index.tsx:23`
  **Status:** Fixed
  A user bouncing between the login-choice screen and the register page re-fetches and re-sorts the whole directory collection each time.
  **Resolution:** per the clarifying-question decision, added an indefinite module-level cache to `fetchAcceptingInstitutions()` in `src/lib/registrationDirectory.ts` (the shared helper Item 15 already extracted) — first call fetches and caches, every later call reuses it until a full page reload. Caches the in-flight promise itself so two callers racing on first load share one fetch instead of two; a failed fetch clears the cache so the next call can retry. Mirrors Item 17's "cache until reload, accept a small staleness window" posture for the same underlying collection. `tsc`/`eslint`/the 87-test suite all pass. No rules change, so no deploy needed for this item.

- [x] **21. `persistStep`'s three writes run sequentially instead of in parallel**
  **File:** `src/scenes/(dashboard)/registrations/ConvertToAccountsPanel.tsx:55-76`
  **Status:** Fixed (partially — scoped deliberately, see below)
  `setDoc` → `updateDoc` → `addDoc` (audit log) are awaited one after another despite no interdependency — could be `Promise.all([...])`, cutting step latency roughly 3x.
  **Resolution:** per the clarifying-question decision, only the `student_parents` `setDoc` and the `enrollmentRegistrations` `updateDoc` were parallelized via `Promise.all` — the audit log `addDoc` deliberately stays last and sequential, not folded in. The finding's own literal ask (all three in one `Promise.all`) would have broken the retry-safety invariant Item 6's resolution documents: logging "converted" before both writes actually landed risks a misleading, or on retry duplicate, audit entry. `tsc`/`eslint`/the 87-test suite all pass. No rules change, so no deploy needed for this item.

---

## Simplification

- [x] **22. `ConvertToAccountsPanel`'s `uids` state is never read in JSX**
  **File:** `src/scenes/(dashboard)/registrations/ConvertToAccountsPanel.tsx:37,82-85`
  **Status:** Fixed
  Should be a `useRef` instead of `useState` — avoids an extra render per step for a value that's only ever passed forward, never rendered.
  **Resolution:** switched `uids`/`setUids` to a `uidsRef` ref, matching exactly what the finding suggested. Unambiguous mechanical refactor — no behavior change. `tsc`/`eslint`/the 87-test suite all pass. No rules change, so no deploy needed for this item.

- [x] **23. Duplicated status predicate with swapped operand order**
  **File:** `src/scenes/(dashboard)/registrations/index.tsx:276,284`
  **Status:** Fixed
  The "Convert to accounts" and "Reject" buttons both guard on `status !== "converted" && status !== "rejected"`, written out twice with the comparisons swapped — should be a single `canTransition` computed once.
  **Resolution:** extracted `canTransition` (computed alongside `selected`) and used it at both button sites, matching exactly what the finding suggested. Unambiguous, no behavior change. `tsc`/`eslint`/the 87-test suite all pass. No rules change, so no deploy needed for this item.

- [x] **24. Dead code: unreachable `institutionId !== "*"` check**
  **File:** `src/scenes/(dashboard)/registrations/index.tsx:305`
  **Status:** Fixed
  The component already returns early at line 190 when `institutionId === "*"`, so this later check can never be false-triggered — safe to drop.
  **Resolution:** removed `&& institutionId !== "*"` from the `ConvertToAccountsPanel` render guard; kept `institutionId &&` since that truthiness check still narrows the type for the `institutionId` prop. Unambiguous, no behavior change. `tsc`/`eslint`/the 87-test suite all pass. No rules change, so no deploy needed for this item.

- [ ] **25. Login page's institution dropdown is ~30 lines for a purely cosmetic logo swap**
  **File:** `src/scenes/(auth)/login/index.tsx:91-105,185-204`
  **Status:** Won't fix
  The query, state, and `<select>` UI exist only to swap the card logo before sign-in (`signIn()` takes no institution parameter) — an extra network read on every login-page visit for a dropdown most users will find meaningless.
  **Resolution:** per the clarifying-question decision, kept as-is. This is a deliberate Phase 5 design decision, documented in `STUDENT_REGISTRATION_FORM_SPEC.md`'s §Design Decisions as intentionally cosmetic. It's also a product/UX decision (remove a branding-preview feature), not a mechanical code simplification, so it wasn't treated as an unambiguous fix. The "extra network read on every visit" part of the finding is now largely moot regardless — **Item 20**'s caching means `fetchAcceptingInstitutions()` is shared/cached with `/register` for the tab's lifetime.

- [x] **26. Firestore rules' 5 negative field checks could be one `hasOnly()`**
  **File:** `firestore.rules:1266-1270`
  **Status:** Fixed (resolved as part of Item 2)
  Five separate `!('x' in request.resource.data)` checks on top of the `hasAll()` — a positive `hasOnly([...])` is both simpler and strictly safer (an allow-list can't be forgotten the way a deny-list can when a new field is added later). Overlaps with #2's `hasOnly()` recommendation — likely the same fix covers both.
  **Resolution:** see Item 2 — the `hasOnly()` added there made all 5 negative checks provably dead code, so they were removed in the same edit.

---

## Altitude (Architectural — lower priority for a single PR)

- [ ] **27. `ConvertToAccountsPanel` is a fully hand-rolled multi-step wizard**
  **File:** `src/scenes/(dashboard)/registrations/ConvertToAccountsPanel.tsx:93-206`
  **Status:** Won't fix
  No shared `Modal`/`Wizard` primitive exists in `src/components/` (only `FormModal.tsx`/`PDFPreviewModal.tsx`, neither multi-step). Its overlay opacity/z-index (`bg-black/70 z-[60]`) is also inconsistent with the other modal in this diff (`registrations/index.tsx` uses `bg-black/60 z-50`), a z-index-escalation trick to stack above it.
  **Resolution:** per the clarifying-question decision, kept as-is. The doc's own category note flags this as "lower priority for a single PR" — building a shared Modal/Wizard primitive is a real architectural undertaking affecting other flows across the codebase, not a scoped fix here. The z-index difference (`z-[60]` vs `z-50`) also isn't a bug: `ConvertToAccountsPanel` deliberately stacks on top of the registrations detail modal, so a higher z-index is necessary, not inconsistent.

- [ ] **28. `institutionId === "*"` / per-route role-gate boilerplate — not introduced by this diff, but added to it**
  **Files:** `src/scenes/(dashboard)/registrations/index.tsx:190-197`, `src/App.tsx:280-289`
  **Status:** Won't fix
  Both are copy-paste boilerplate matching a pre-existing repo-wide convention (15+ other instances for the institution guard; 30+ for the role-gate ternary). Not a regression or a new problem — flagged only because this diff was a real opportunity to extract a shared `SuperAdminScopeGuard`/`RoleGate` component, and instead added one more copy of each pattern.
  **Resolution:** per the clarifying-question decision, kept as-is. Extracting a shared component only for this diff's 2 new call sites would leave 45+ existing instances on the old pattern — less consistent, not more. Doing it repo-wide is a real refactor spanning many routes/files unrelated to this PR's registration-form scope.

---

## Follow-ups discovered while fixing the above

Not from the original 8-agent review — found while tracing rules for Items 1–5 and deliberately scoped out of those fixes rather than folded in silently. Same numbering sequence, appended rather than inserted, so existing item numbers (already referenced in commit messages) don't shift.

- [x] **29. `enrollmentRegistrations` update rule has no `hasOnly()`/field-allow-list**
  **File:** `firestore.rules` — the `allow update` block on `institutions/{institutionId}/enrollmentRegistrations/{registrationId}`
  **Status:** Fixed
  Unlike the create rule (Items 2/3, both now pinned via `hasAll()`+`hasOnly()`), the update rule only pins specific known fields as unchanged (`student`/`mother`/`father`/`academicYearId`/`academicYearName`/`submittedAt`) and constrains `status`/`possibleDuplicate`'s values/types — it never restricts the update to a known set of top-level keys. An admin update could smuggle in an arbitrary new field alongside a legitimate status/duplicate-flag change, since nothing rejects unrecognized keys the way the create rule now does.
  **Why not folded into Item 5:** correctly enumerating every field any legitimate update path touches is a meaningfully bigger task than Item 5's one-line type check — it has to account for a plain status transition, a review action (sets `reviewedAt`/`reviewedBy`), a duplicate-flagging pass (`possibleDuplicate` only), and the conversion flow (sets one or more of `convertedStudentUid`/`convertedMotherUid`/`convertedFatherUid` alongside `status`) without breaking any of them. Worth its own careful pass.
  **Resolution:** traced every legitimate update call site in the code (`transition()`: `status`/`reviewedAt`/`reviewedBy`; the duplicate-detection batch: `possibleDuplicate`; `ConvertToAccountsPanel.persistStep`: one of `convertedStudentUid`/`convertedMotherUid`/`convertedFatherUid` plus optionally `status`) to build the allow-list. Key subtlety: `hasOnly()` on update checks the keys of the *entire resulting document* (Firestore merges `updateDoc`/`batch.update` onto the existing doc), not just the fields one call writes — so the list had to be the union of all 9 create-time fields plus all 5 update-only fields the document can accumulate over its lifecycle (pending → reviewed → converted), 14 total, not just any single update's field set. Per the clarifying-question decision, also added type checks (`is timestamp` / `is string`, each only when present) to the 5 update-only fields, which previously had none at all. **Deployed** to `school-sms-v1` via `npm run firebase:deploy:rules` — compiled and released successfully.
