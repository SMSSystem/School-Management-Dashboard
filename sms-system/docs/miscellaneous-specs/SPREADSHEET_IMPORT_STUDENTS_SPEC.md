# Spreadsheet Import — Students Target, JSON Support & Forced Password Change — Feature Spec

> **Status:** Planned — not yet implemented (spec written before code, per this repo's standing convention)
> **Feature:** Extends the existing Spreadsheet Import tool (`/dashboard/import`) with a 6th target — bulk-creating Student accounts — plus JSON as a 3rd supported file format, plus a new forced-password-change subsystem the Students target depends on
> **Route:** `/dashboard/import` (existing route, extended — no new route for the import feature itself); one new route for the forced-password-change gate, e.g. `/change-password`
> **Primary roles:** Students target usable by `institution_admin`/`super_admin` only (not `senior_teacher`/`regular_teacher`, unlike the other 5 targets)
> **Resolves:** Item 8 of `internal/analyses/live-site-issues-triage.md` ("Extend Spreadsheet Import to populate the Students list (+ JSON support)"), itself sourced from `internal/dev-notes/issues-that-were-discovered-while-accessing-the-live-site-after-the-seed-began.txt`

---

## Overview

The Spreadsheet Import tool (`src/scenes/(dashboard)/import/index.tsx`) currently supports five targets — Results, MDDS, Gradebook, General Attendance, Subject Attendance — all built on a shared, genuinely target-agnostic engine (`src/lib/spreadsheetImport.ts`). Every existing target has one thing in common: it only ever writes Firestore documents that _reference_ already-existing `users` documents. None of them create new accounts.

A "Students" import target breaks that pattern. Populating the Students list from a spreadsheet means **bulk-creating Firebase Auth accounts**, not just Firestore documents — a meaningfully different problem, closer in shape to `AdminCreateUserForm.tsx`'s single-account creation flow (and to the bulk-seed script's `createUser()` loop) than to anything the import engine does today.

Two hard constraints, confirmed during investigation, shape this entire spec:

1. **Firebase enforces a hard 100-accounts-per-hour-per-IP ceiling on client-side account creation** (`createUserWithEmailAndPassword`), with no workaround short of the Admin SDK running server-side. This app has no server-side component (no `functions/` directory, no service account exposed to the browser), so this ceiling is a hard wall for a client-only implementation, not a tuning parameter.
2. **This app has no "must change password on first login" mechanism today** — confirmed via a full-codebase grep for `updatePassword`/`reauthenticateWithCredential`/`EmailAuthProvider`, all zero matches. Because imported accounts share one fixed password (see §Design Decisions), this mechanism has to be built as a prerequisite, not an optional nicety.

This spec therefore covers three deliverables together, in dependency order:

- **Part A — JSON file support**, applied uniformly to all 6 import targets (cheap, decoupled from the Students-specific work).
- **Part B — Forced password change**, new greenfield subsystem the Students target depends on.
- **Part C — The Students import target itself**, built on top of Parts A and B.

---

## Background / Investigation Findings

Everything below was confirmed by direct file reads and one web search during investigation — not assumed.

- **The import engine is fully reusable.** `ImportColumn<T>`, `parseRequiredString`/`parseNumberCell`/`parseDateCell`/`parseEnumCell`/`parseBooleanCell`, `validateStructure`, `parseRows`, `resolveIdentities`/`matchByName`, `validateRows`, `countAdvisoryDuplicates`, `downloadImportTemplate` all operate on plain `RawRow[]`/generic `T` and apply to a Students target exactly as they do to the other 5. Each existing target defines its own column/validation module on top of this shared engine (e.g. `src/lib/importResults.ts`) — Students follows the same pattern.
- **`chunkedBatchWrite` does not apply to Auth account creation.** It commits `PendingWrite[]` as ≤450-op Firestore batches — a mechanism with no equivalent for `createUserWithEmailAndPassword`, which has no bulk endpoint and must be called once per account, sequentially, over the network.
- **The secondary-Firebase-app pattern is already proven** in `AdminCreateUserForm.tsx` (`src/components/forms/AdminCreateUserForm.tsx:311-317`): a second Firebase App instance (`getApps().some(...) ? getApp(appName) : initializeApp(firebaseConfig, appName)`) backs a `getAuth(secondaryApp)` instance used only for `createUserWithEmailAndPassword`, so the admin's own session on the default `auth` instance is never disturbed. The same file also already has the rollback pattern this spec reuses: if the Firestore profile write fails after the Auth account was created, `deleteUser(createdUser)` undoes it (`AdminCreateUserForm.tsx:534-541`).
- **Firebase Auth account-creation rate limit**: confirmed via web search — 100 new accounts per hour per IP address on the client SDK, with Admin SDK / `Auth.importUsers()` as the only unthrottled alternatives, both server-side only. Source: [firebase.google.com/docs/auth/limits](https://firebase.google.com/docs/auth/limits).
- **No forced-password-change infrastructure exists.** No `mustChangePassword`-style field on `UserDocument`, no reauthentication code, no "set a new password" scene anywhere in `src/`.
- **A proven, reusable password-reset primitive already exists** (`sendPasswordResetEmail`), used in `src/components/AccountActionsCard.tsx` and `src/scenes/(dashboard)/super-admin/manage-admins/index.tsx`. **Not used by this spec** — the project owner explicitly chose a shared fixed password over the auto-generate-and-email-a-reset-link approach (see §Design Decisions) — but noted here since it's the natural alternative if the shared-password approach is revisited later.
- **`firestore.rules`' `users/{uid}` create rule imposes no field-shape restriction** beyond `role` and `institutionId` (`firestore.rules:175-176`: `isSuperAdmin() || (isAdmin() && writingToMyInstitution() && request.resource.data.role in [...])`) — confirmed the same way item 4/5 of the triage already confirmed it. The update rule (`firestore.rules:182-184`) lets an owner update their own document freely as long as `role`/`institutionId` don't change. Both facts mean **this feature needs zero `firestore.rules` changes** — see §Firestore Security Rules below for the full reasoning.
- **`Protected.tsx`** (`src/components/Protected.tsx`) is the existing, minimal gate every dashboard route already passes through (`loading` → spinner, `!user` → redirect to `/login`, else render `children`). It's the natural hook point for a forced-password-change gate — the same architectural role `PostLoginInstitutionGate.tsx` already plays for the institution-mismatch check on the `/login` route itself.
- **`AuthContext.tsx`'s `fetchRole`/`refreshProfile`** already read the entire `users/{uid}` document on every sign-in and on demand — adding `mustChangePassword` to context state is a zero-new-read addition to existing code, not a new fetch.

---

## Design Decisions

| Decision                                               | Choice                                                                                                                                                                                       | Rationale                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial password for imported accounts                 | **One fixed, shared password across every Students import**: `"Student01234567890"`                                                                                                          | Explicit project-owner choice over auto-generate-and-email-a-reset-link. Mirrors the bulk-seed script's own `SHARED_TEST_PASSWORD` precedent, but for real accounts — see the security callout in §Security Considerations for how this differs from the seed script's case (client-bundle visibility). |
| Forced first-login password change                     | **Required** — new `mustChangePassword` flag, enforced by a new dashboard-wide gate                                                                                                          | The shared-password choice above is only acceptable with this as a paired mitigation: it bounds the window during which the shared password is valid for any one account to "until that student's first login."                                                                                         |
| Rate-limit handling                                    | **Hard cap of 90 rows per Students import session** (under Firebase's 100/hour/IP ceiling, leaving headroom for any other account creation from the same network in that hour)               | A client-only implementation cannot exceed Firebase's enforced ceiling under any circumstances. Capping below it with clear messaging is more honest than attempting a larger import and letting it fail partway through.                                                                               |
| Who can use the Students target                        | `institution_admin` + `super_admin` only — **not** `senior_teacher`/`regular_teacher`                                                                                                        | The only import target where this differs from the other 5. Matches `firestore.rules`' actual `users` create permission (`isAdmin()`/`isSuperAdmin()` specifically) — teachers cannot create accounts in this app today, in any flow.                                                                   |
| JSON file support scope                                | **All 6 import targets**, not just Students                                                                                                                                                  | It's a file-format-level addition to `parseSpreadsheetFile` (`spreadsheetImport.ts`), fully decoupled from the Students-specific work. Scoping it to one target only would be an arbitrary, costless-to-avoid inconsistency.                                                                            |
| Auth-creation commit mechanism                         | New sequential per-row loop in `import/index.tsx`, **not** `chunkedBatchWrite`                                                                                                               | `chunkedBatchWrite` is Firestore-batch-specific; Auth account creation has no bulk/batch endpoint on the client SDK and must happen one network round-trip at a time.                                                                                                                                   |
| Rollback on partial failure                            | Per-row: if the Firestore profile write fails after a successful Auth create, `deleteUser()` the just-created account (mirrors `AdminCreateUserForm.tsx`'s existing single-account rollback) | Prevents orphaned Auth accounts with no matching `users/{uid}` document — the same failure mode `AdminCreateUserForm.tsx` already guards against for one-at-a-time creation.                                                                                                                            |
| Uniqueness checks (`institutionStudentId`, `idNumber`) | Batched once at the summary step (mirrors `fetchExistingKeysFor`'s existing pattern), **before** committing                                                                                  | Fails fast on rows that would error anyway, without spending any of the scarce 90-row/hour Auth-creation budget on them.                                                                                                                                                                                |
| Class/House assignment columns                         | Optional, identity-resolved by name (same `matchByName` mechanism every other target already uses for Class/Subject/Term)                                                                    | Consistent with the rest of the import engine; an admin can also leave these blank and assign Class/House afterward via the existing per-student edit flow.                                                                                                                                             |
| Forced-password-change scope                           | Narrow: only gates accounts with `mustChangePassword: true` (i.e. only Students-import-created accounts in v1)                                                                               | `AdminCreateUserForm.tsx`'s existing single-account flow lets the admin set a real, distinct password directly — no change needed there, and no reason to force a change on accounts that already got a real password.                                                                                  |

---

## Data Model

### `UserDocument` — one new field

```diff
 export type UserDocument = {
   role: Role;
   name: string;
   institutionId: string;
   phone?: string;
   phone2?: string | null;
   idNumber?: string | null;
+  mustChangePassword?: boolean;
   address?: string;
   status?: 'active' | 'inactive' | 'suspended';
   ...
```

**Notes:**

- Omitted (not written as `false`) on every account created through the existing single-account `AdminCreateUserForm.tsx` flow — only Students-import-created accounts ever get this field written, and always as `true` at creation time.
- Cleared by the student themselves (`mustChangePassword: false`, via a plain `updateDoc`) once they successfully complete the forced password change — not by an admin action.
- No versioning/history needed — this is a point-in-time gate, not an audit trail.

### No changes needed to any other collection

`enrollmentRegistrations`, `institutions`, `registration_directory`, etc. are untouched by this feature.

---

## Part A — JSON File Support (all 6 targets)

### `src/lib/spreadsheetImport.ts` — `parseSpreadsheetFile`

Extend format detection to a third branch:

```diff
 export async function parseSpreadsheetFile(file: File): Promise<RawRow[]> {
   const isCSV = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
+  const isJSON = file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
+  if (isJSON) {
+    const parsed: unknown = JSON.parse(await file.text());
+    if (!Array.isArray(parsed)) {
+      throw new Error('The JSON file must contain an array of row objects.');
+    }
+    return parsed as RawRow[];
+  }
   const workbook = isCSV
     ? XLSX.read(await file.text(), { type: 'string' })
     : XLSX.read(await file.arrayBuffer(), { type: 'array' });
   const sheet = workbook.Sheets[workbook.SheetNames[0]];
   return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null });
 }
```

**Design notes:**

- A JSON row's keys must match the same column _headers_ every target's `ImportColumn<T>[]` already expects (e.g. `"Student"`, `"Class"`, `"Score"`) — no separate JSON-specific schema. This keeps `validateStructure`/`parseRows` completely unaware of which file format produced the `RawRow[]` they're validating, exactly as they are today for CSV vs. XLSX.
- A malformed JSON file (not valid JSON, or valid JSON that isn't an array) throws synchronously, caught by the same `try/catch` in `handleFile()` that already handles `parseSpreadsheetFile` failures today (`fileError` state, "Failed to read file." fallback message) — no new error-handling path needed.
- `downloadImportTemplate` stays CSV/XLSX-only (a JSON template is easy to hand-write from either existing format if ever wanted, and no target's spec has asked for one) — not a gap worth closing preemptively.
- File-picker `accept` attribute in `import/index.tsx`'s upload step gains `.json`/`application/json` alongside the existing `.csv`/`.xlsx` values.

---

## Part B — Forced Password Change (new subsystem)

### `AuthContext.tsx`

Add `mustChangePassword` to context state, populated from the same `users/{uid}` read `fetchRole`/`refreshProfile` already perform — no new Firestore read:

```diff
 interface AuthContextValue {
   user: User | null;
   role: Role | null;
   ...
+  mustChangePassword: boolean;
   loading: boolean;
   ...
 }
```

```diff
   setLinkedAccounts((data?.linkedAccounts as string) ?? null);
+  setMustChangePassword((data?.mustChangePassword as boolean) ?? false);
   setClassId(fetchedRole === 'student' ? ((data?.classId as string) ?? null) : null);
```

(Mirrored in `refreshProfile()` and reset to `false` in the `onAuthStateChanged`'s signed-out branch, alongside every other piece of per-user state already reset there.)

### `Protected.tsx` — new gate

```diff
+const CHANGE_PASSWORD_PATH = '/change-password';
+
 export default function Protected({ children }: { children: React.ReactNode }) {
-  const { user, loading } = useAuth();
+  const { user, loading, mustChangePassword } = useAuth();
   const location = useLocation();

   if (loading) { ... }
   if (!user) { return <Navigate to="/login" replace state={{ from: location }} />; }

+  // /change-password's own content lives inside `children` (see below),
+  // same as every other dashboard page — without this pathname exemption,
+  // a flagged account landing there would be bounced straight back to
+  // itself, with no way to ever reach the form that clears the flag.
+  if (mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) {
+    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
+  }

   return <>{children}</>;
 }
```

**CORRECTED (during item 3's implementation, before item 4 was built):** the redirect target itself is dashboard content, not an auth-adjacent route like `/login`/`/register` — those are handled by `App.tsx`'s separate `isAuthRoute` branch, entirely outside `<Protected>`. `/change-password` has to be reachable _through_ `Protected` (it's the only way a flagged account can ever clear the flag), so a bare `if (mustChangePassword) { return <Navigate to="/change-password" replace />; }` with no pathname exemption would trap a flagged account in a dead-end redirect loop back to a page that itself renders nothing, since `Protected`'s early return replaces `children` — the very thing that would contain the `/change-password` route's content. The pathname check above is the fix, implemented directly rather than left for item 4 to discover.

This blocks every dashboard route the same way the existing `!user` check already blocks unauthenticated access — a flagged account cannot reach any dashboard page other than `/change-password` until the flag clears.

### New scene — `src/scenes/(auth)/change-password/index.tsx`

A route registered **inside** `App.tsx`'s nested `<Routes>` (the one already holding every `/dashboard/*` route, inside `<Protected><DashboardLayout>...`), _not_ alongside `/login`/`/register` in the separate `isAuthRoute` branch — those routes are intentionally reachable without a session at all, which `/change-password` is not. Reachable only by a signed-in user with `mustChangePassword: true` (enforced by the `Protected.tsx` redirect above — not itself gated by role, since any imported role could in principle carry this flag in the future even though v1 only ever sets it for students).

**Flow:**

1. Form fields: New Password, Confirm New Password. Same complexity rule as `createUserSchema`'s existing password field (`zod`: min 8 chars, one lowercase, one uppercase, one digit) for consistency with the rest of the app.
2. On submit, attempt `updatePassword(auth.currentUser, newPassword)` directly first.
3. If Firebase throws `auth/requires-recent-login` (possible if the session isn't fresh, though unlikely immediately after a first sign-in), fall back to prompting for the current (shared) password, then `reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(email, currentPassword))`, then retry step 2.
4. On success: `updateDoc(doc(db, "users", uid), { mustChangePassword: false })`, then call `refreshProfile()` (already exposed by `AuthContext`) so `Protected.tsx`'s gate clears without requiring a full page reload, then navigate to `/dashboard`.
5. Errors (weak password rejected by Firebase itself, reauth failure, network) surface inline the same way every other auth-adjacent form in this app already reports `FirebaseError`s (reusing the existing `getFirebaseMessage` helper pattern from `AdminCreateUserForm.tsx`).

**Deliberately out of scope for this scene:**

- No "forgot password" link or recovery path here — a locked-out user in this specific state still knows their (shared) current password by definition; that's a different problem from item 7a's self-service forgot-password flow (deferred separately, see `internal/analyses/live-site-issues-triage.md` item 7a).
- No settings-page "change my password" entry point reusing this scene — scoped narrowly to the forced-first-login case per this session's explicit choice not to over-build. The same Auth calls (`updatePassword`/`reauthenticateWithCredential`) would be directly reusable for a future voluntary change-password feature without modification.

---

## Part C — The Students Import Target

### New file — `src/lib/importStudents.ts`

Mirrors `src/lib/importResults.ts`'s shape (column definitions, `ImportColumn<T>[]`, example row for templates) — deliberately Firebase-free, same convention every other target module follows.

```ts
export interface StudentImportRow {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  phone2?: string;
  idNumber?: string;
  institutionStudentId?: string;
  dateOfBirth?: string;
  gender?: "Male" | "Female";
  className?: string; // identity-resolved, optional
  houseName?: string; // identity-resolved, optional
  // Filled in by resolveIdentities once Class/House (if provided) resolve to exactly one match.
  classId?: string;
  houseId?: string;
}

export type ResolvedStudentImportRow = StudentImportRow;
```

**Column definitions** (header names TBD to match whatever the eventual Students _export_ would use, following the same "export naming wins" precedent `importResults.ts` documents for Results — no Students export exists yet, so these are free to define cleanly):

| Header              | Required | Field                  | Parser                                                                                                           |
| ------------------- | -------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `First Name`        | Yes      | `firstName`            | `parseRequiredString`, `namePattern`                                                                             |
| `Last Name`         | Yes      | `lastName`             | `parseRequiredString`, `namePattern`                                                                             |
| `Email`             | Yes      | `email`                | required string, validated against a standard email shape (mirrors `createUserSchema`'s `z.string().email(...)`) |
| `Phone`             | No       | `phone`                | `phonePattern`                                                                                                   |
| `Second Phone`      | No       | `phone2`               | `phonePattern`                                                                                                   |
| `Citizen ID or TRN` | No       | `idNumber`             | max 50 chars                                                                                                     |
| `Student ID`        | No       | `institutionStudentId` | max 50 chars                                                                                                     |
| `Date of Birth`     | No       | `dateOfBirth`          | `parseDateCell`                                                                                                  |
| `Gender`            | No       | `gender`               | `parseEnumCell(['Male', 'Female'])`                                                                              |
| `Class`             | No       | `className`            | `parseRequiredString` (identity-resolved by `import/index.tsx`, like every other target's Class column)          |
| `House`             | No       | `houseName`            | `parseRequiredString` (identity-resolved)                                                                        |

No `assessmentType`/score-style validation rules needed beyond field-level parsing — unlike Results/Gradebook, there's no cross-field business rule analogous to "score ≤ maxScore" for a student profile row.

### `import/index.tsx` changes

1. **New `TargetKey` member**: `"students"`, added to `IMPLEMENTED_TARGETS` and `TARGET_ALLOWED_ROLES` (`["institution_admin", "super_admin"]` — the one target that excludes both teacher roles).
2. **Identity columns**: `TARGET_IDENTITY_COLUMNS.students = ["Class", "House"]` (both optional — `resolveIdentities` already treats a column with zero rows referencing it as trivially resolved).
3. **Candidate fetch**: a new `fetchStudentsCandidates(institutionId)` returning `{ classes, houses }` via the existing `fetchNameCandidates` helper — no `students` candidate list needed (there's no existing-student column to resolve against; every row creates a new one).
4. **Summary step**: batched pre-write uniqueness check across all resolved rows for `institutionStudentId`/`idNumber` (scoped by `institutionId`, mirroring `AdminCreateUserForm.tsx`'s per-submit check but done once for the whole batch here) — any conflicting row is surfaced as a row error and excluded from commit, consistent with how other targets report business-rule failures.
5. **Hard cap enforcement**: if `resolvedRows.length > 90`, block advancing past the summary step with an explicit message (see §Design Decisions) rather than silently truncating the file.
6. **New commit path** (`handleCommit`'s `target === "students"` branch) — sequential, not chunked:

```ts
async function commitStudentsImport(rows: ResolvedStudentImportRow[], institutionId: string, secondaryAuth: Auth) {
  const progress: CommitProgress = { done: 0, total: rows.length, errors: [] };
  const failed: (Row & { __error: string })[] = [];

  for (const row of rows) {
    let createdUser: FirebaseUser | null = null;
    try {
      const credentials = await createUserWithEmailAndPassword(
        secondaryAuth,
        row.email.toLowerCase(),
        SHARED_STUDENT_IMPORT_PASSWORD,
      );
      createdUser = credentials.user;

      await setDoc(doc(db, "users", createdUser.uid), {
        uid: createdUser.uid,
        role: "student",
        institutionId,
        firstName: row.firstName,
        lastName: row.lastName,
        name: `${row.firstName} ${row.lastName}`,
        email: row.email.toLowerCase(),
        phone: row.phone || undefined,
        phone2: row.phone2 || null,
        idNumber: row.idNumber || null,
        institutionStudentId: row.institutionStudentId || null,
        dateOfBirth: row.dateOfBirth || null,
        gender: row.gender ?? null,
        classId: row.classId || null,
        houseId: row.houseId || null,
        status: "active",
        mustChangePassword: true,
        createdAt: serverTimestamp(),
        createdBy: /* admin uid */,
      });

      await signOut(secondaryAuth);
      progress.done += 1;
    } catch (err) {
      if (createdUser) {
        try { await deleteUser(createdUser); } catch { /* best-effort rollback */ }
      }
      const message = getFirebaseMessage(err);
      progress.errors.push(message);
      failed.push({ ...row, __error: message });
    }
    onProgress({ ...progress });
  }

  return { progress, failed };
}
```

**Key differences from `chunkedBatchWrite`:**

- One row = one full Auth-create-then-Firestore-write cycle, not a member of a 450-op batch.
- Progress updates after **every row**, not after every chunk — a Students import of even 90 rows takes noticeably longer (network round-trip per row) than a 90-row Firestore-only import, and the UI should reflect that granularity.
- A single row's failure never aborts the loop (matches every other target's non-aborting accumulation pattern), and a Firestore-write failure after a successful Auth create triggers immediate rollback of that one Auth account — not deferred to some end-of-batch cleanup pass.

7. **`SHARED_STUDENT_IMPORT_PASSWORD` constant** — module-level, `"Student01234567890"`, colocated in `import/index.tsx` (or `importStudents.ts`) with a comment cross-referencing this spec's §Security Considerations.
8. **Template/error report**: `downloadImportTemplate`/`downloadErrorReport` wired the same way every other target already does, no new mechanism.

---

## Firestore Security Rules

**No `firestore.rules` changes required.** Confirmed by direct reading of the current rules:

- `users/{uid}` **create**: `isSuperAdmin() || (isAdmin() && writingToMyInstitution() && request.resource.data.role in ['senior_teacher', 'regular_teacher', 'student', 'parent'])` — already permits an `institution_admin` to create a `role: 'student'` document with an arbitrary field set, including the new `mustChangePassword` field, exactly as it already permits every field `AdminCreateUserForm.tsx` writes today.
- `users/{uid}` **update**: `(isOwner(uid) && roleNotChanged() && institutionNotChanged()) || (isAdminOrAbove() && sameInstitution(...) && institutionNotChanged() && roleNotChanged())` — already permits the signed-in student themselves to flip `mustChangePassword: false` on their own document, since that update changes neither `role` nor `institutionId`.
- No new collection is introduced, so no new `match` block is needed.

This mirrors items 4/5's own finding in the triage doc — the `users` collection's rules were never written to enumerate/restrict field shape the way `enrollmentRegistrations`' rules are, so new optional fields consistently require no rules work.

---

## Security Considerations

**The shared password is visible in the client bundle.** `SHARED_STUDENT_IMPORT_PASSWORD` is a plain string constant in code shipped to every browser that loads the app — readable via browser devtools or view-source by anyone, unlike the bulk-seed script's own `SHARED_TEST_PASSWORD`, which lives in a local Node script that is never sent to a browser. Combined with a guessable institutional email convention (e.g. `firstname.lastname@school.domain`), this means anyone who can guess or learn an imported student's email address can sign into that account at any time between creation and that student's first login.

**Accepted mitigation, per explicit project-owner decision:** the forced-password-change gate (§Part B) bounds this exposure window to "until first login," rather than closing it entirely. This is a real, accepted tradeoff, not an oversight — flagged here so it stays visible in the permanent record of this feature rather than only in conversation.

**Possible future hardening (not in this spec's v1, listed for later consideration):**

- Randomize the shared password **per import batch** (one password per CSV/XLSX/JSON upload, shown to the importing admin once, not persisted in source) instead of one constant fixed for all time across every institution. Would shrink the blast radius of a leaked password from "every imported student ever" to "one import session," at the cost of the admin needing to communicate a different password each time instead of one memorized value.
- Auto-expire the shared password's validity window (e.g. reject sign-in attempts using it after N days from `createdAt`, forcing an admin-mediated reset instead) — meaningfully more complex, not recommended for v1.
- Reconsider the auto-generate-plus-`sendPasswordResetEmail` alternative (§Design Decisions, §Background) — already fully proven elsewhere in this codebase and would eliminate this entire risk category, at the cost of the admin having no memorable shared credential to distribute and every imported row needing a real, reachable email address (already true today regardless — see below).

**Email reachability.** Every imported row already requires a real email address (Firebase Auth account creation has no option to omit one), same requirement the existing single-account Create Account form already imposes — not a new constraint introduced by this feature.

---

## Rate-Limit / Operational Considerations

- **90-row cap is a per-session, per-hour ceiling, not a per-institution or per-admin daily quota** — it's tied to Firebase's IP-based accounting, which this app has no visibility into or control over. Two different admins importing from the same office network in the same hour share the same 100-account budget; the 90-row cap leaves only 10 accounts of headroom for any other account creation (via this feature or the ordinary Create Account page) happening concurrently on that network.
- **No client-side way to detect remaining quota before starting.** A commit that runs into the ceiling mid-import will surface as `auth/too-many-requests` (or similar) errors on the affected rows, reported the same way any other per-row failure is reported (§Part C step 6) — not specially detected or pre-empted.
- **Cohorts larger than 90** require multiple import sessions, spaced roughly an hour apart. This is explicit, expected behavior for this feature's v1 — not a bug to fix later unless the Cloud Functions/Blaze billing question (already parked against dev-notes item 11 — see `internal/analyses/live-site-issues-triage.md`) is revisited, which would unlock an Admin-SDK-backed unthrottled path.

---

## Implementation Order

1. `firebase.ts` — add `mustChangePassword?: boolean` to `UserDocument`.
2. `AuthContext.tsx` — add `mustChangePassword` to context state, populated in `fetchRole`/`refreshProfile`, reset on sign-out.
3. `Protected.tsx` — add the `mustChangePassword` redirect.
4. New scene `src/scenes/(auth)/change-password/index.tsx` + route registration in `App.tsx`.
5. Manually flag a test user's `users/{uid}` document with `mustChangePassword: true` (Firebase Console) and verify the gate blocks/unblocks correctly end to end — this can and should be tested independently of everything below, before the Students target exists at all.
6. `spreadsheetImport.ts` — JSON support in `parseSpreadsheetFile`.
7. `src/lib/importStudents.ts` — new column definitions/types.
8. `import/index.tsx` — register the `students` target, role gating, candidate fetch, uniqueness pre-check, 90-row cap, the new sequential commit path, template/error-report wiring.
9. Manual verification of a small (2-3 row) real Students import against a real (non-seed) test institution — deliberately small, given the 100/hour ceiling applies to this testing too.

---

## Testing Considerations

- `npx tsc -b` / `npx eslint` / `npx vitest run` / `npm run build` — same standing gate this project applies after every implementation step.
- **The Auth-creation commit path cannot be meaningfully unit-tested** the way `chunkedBatchWrite` is (`chunkWrites`' pure chunking logic is unit-tested; the real Firestore commit itself isn't, per that module's own existing precedent) — `createUserWithEmailAndPassword`/`deleteUser`/`signOut` against a live secondary Auth instance are a browser/network boundary. Recommend the same precedent: unit-test the pure pieces (column parsing, the 90-row cap check, uniqueness-conflict detection), leave the actual account-creation loop to manual verification.
- **Manual end-to-end testing is inherently rate-limited by the same 100/hour ceiling this feature is designed around** — a full 90-row test run consumes nearly the entire hourly budget for whatever network the tester is on. Recommend testing with a small handful of rows (2-5) to verify correctness of the write shape, error handling, and rollback behavior, rather than repeatedly testing at or near the cap.
- Forced-password-change gate (§Part B) should be tested independently first (step 5 above), since it has no dependency on Firebase's account-creation rate limit and can be iterated on freely.

---

## Deferred Items

- **Server-side bulk import via Admin SDK / Cloud Functions** — would remove the 100/hour/IP ceiling entirely, but requires standing up a `functions/` directory and upgrading off the Spark billing plan, the same open question already parked against dev-notes item 11 (delete institution). Revisit both together if/when that billing decision is made.
- **Per-import randomized shared password** — see §Security Considerations' "possible future hardening" list.
- **Auto-generate-password-plus-reset-email alternative** — the road not taken for v1; fully proven building blocks (`sendPasswordResetEmail`) already exist elsewhere in this codebase if reconsidered later.
- **Reusing the forced-password-change scene for a voluntary "change my password" settings entry** — the underlying Auth calls are directly reusable; not built in v1 per this session's explicit choice to keep scope narrow.
- **Item 7a's self-service forgot-password flow** — a related but distinct feature (a locked-out user who does _not_ know their current password), tracked separately in `internal/analyses/live-site-issues-triage.md`, not folded into this spec.
- **Parent-account linking during Students import** — out of scope for v1; an imported student is created without any `student_parents` junction records. Linking to parent accounts (existing or newly created) would need its own design pass.
- **Bulk update (not just create) via the Students target** — v1 is create-only; re-importing a file containing already-created students' emails will simply fail those rows with `auth/email-already-in-use`, reported like any other row error, not merged/updated.

---

## Issues to Track

- The 90-row cap and the underlying 100/hour/IP Firebase limit are **not configurable or discoverable from within this app** — if Firebase ever changes this default limit (increases or decreases it), the cap in this feature would need a corresponding manual update; nothing here will detect drift automatically.
- The shared-password security tradeoff (§Security Considerations) should be revisited if this feature sees real production use at meaningful volume — the risk scales with how many accounts are ever created under the same fixed password before any hardening is applied.

---

_End of spec._
