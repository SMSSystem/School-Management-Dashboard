# PII Split of `users/{uid}` — Design Note

> **Status:** design / planned, **nothing built.** Written 2026-10-06. This is the long pole created by decision **D1** ("the BE serves PII reads from the start") in [`BACKEND_ARCHITECTURE_SPEC.md`](./BACKEND_ARCHITECTURE_SPEC.md). Endpoint shapes are in [`OPENAPI_V0_ENDPOINTS.md`](./OPENAPI_V0_ENDPOINTS.md).
> **Evidence:** hand-run code survey on 2026-10-06 (`src/`, `scripts/`, `firestore.rules`, `firestore.indexes.json`). A broader automated survey was interrupted, so the **reader/writer inventory below is thorough for the paths named but should be re-run with a full-repo grep before implementation** (§12). Items marked **[VERIFY]** need that check or a console look.
> **No secret or credential values appear here.** Existing password literals are out of scope for this note.

---

## 1. Goal and non-goals

**Goal.** Make it impossible for a browser to read a person's sensitive profile fields (date of birth, national/citizen ID, phone numbers, address, emergency contact, e-mail) directly from Firestore. Those fields move to a **BE-only** sub-document; the browser gets them only through authorised, `no-store` BE responses. Everything the UI needs in bulk (rosters, pickers, lists) is served from a small **public profile** that holds no PII.

**Why it must come first.** `firestore.rules` are *not filters*. As long as the PII sits on `users/{uid}`, any role the rules let read that document gets all of it, and the SPA's own cache layers (Firestore IndexedDB cache; the TanStack sessionStorage persister) keep copies. "PII via the BE" is meaningless until the PII is physically elsewhere.

**Non-goals.** Changing who is *allowed* to see a person (that is a policy decision — §5); moving photos (already a separate sub-document, handled by the BE batch endpoint and the file work); redesigning other collections (their slices are listed in the architecture spec §4.1 and follow this pattern later).

---

## 2. Current state (survey)

### 2.1 The document

`UserDocument` (`src/lib/firebase.ts:227-266`) holds, mixed on one document for every role: `role, name, institutionId, phone, phone2, idNumber, mustChangePassword, address, status, department, emergencyContact, linkedAccounts, canGenerateSchedule, assignedClassId/Name, homeroomRoom/Building, classId, institutionStudentId, dateOfBirth, gender, houseId/houseName, toursCompleted`. The creation flow additionally writes `uid, firstName, lastName, email, createdAt, createdBy, departmentId` (`AdminCreateUserForm.tsx:584-624`); `sessionResetAt` is written by the admin reset button and read at sign-in (`AuthContext.tsx:148`).

Photos are already a separate sub-document, `users/{uid}/photo/current` (`firebase.ts:274-285`), kept off the main doc deliberately because the users collection is "read broadly and unpaginated".

### 2.2 How it is read today

| Reader | What it does | Fields it actually needs | Where |
|---|---|---|---|
| **Sign-in** | `getDoc(users/{uid})`, then copies into the global auth context | `role, status, institutionId, name, classId, departmentId, department, mustChangePassword, sessionResetAt` — **but also** loads `phone, address, emergencyContact, linkedAccounts` into context for the profile page | `AuthContext.tsx:121-166`, refresh at `:238-250` |
| **Institution-wide list** | `useInstitutionUsers()` = `getDocs(users where institutionId==)` — **every field of every user**, persisted to sessionStorage (`sms_query_cache`) | The Students/Teachers/Parents tables show name, class, gender, photo, actions — **no PII columns** | `hooks/useInstitutionUsers.ts:19-33`, `list/students/index.tsx:77-105` |
| **Edit forms** | Open pre-filled from the list row (`phone, phone2, idNumber, institutionStudentId, dateOfBirth, …`) | Full profile, but only for the one person being edited | `StudentForm.tsx:165-201` |
| **Student detail page** | `onSnapshot(users/{id})` (live) | DOB shown (`students/[id]/index.tsx:506`), plus parent-link management | `list/students/[id]/index.tsx:145` |
| **Roster/picker queries** | ~50 `collection(db,'users')` call sites filtered by `institutionId`, `role`, `classId`, `assignedClassId`, `houseId`, `departmentId`, `__name__` | name, `classId`, `institutionStudentId`, `houseId`, `status` | e.g. `attendance/general:243`, `ResultForm:95`, `AssignmentForm:243`, `list/houses/[id]:82,104`, `list/classes/[id]:46` |
| **Counters** | `UserCard` (3 queries), `CountChart` read whole role sets to count/split by gender | counts only | `UserCard.tsx:41-53`, `CountChart.tsx:26` |
| **Uniqueness checks** | `where idNumber ==` / `institutionStudentId ==` before create; `in [...]` batches during import | the two id fields | `AdminCreateUserForm.tsx:506-548`, `import/index.tsx:600-625` |
| **Registration duplicate check** | admin client reads all students' first/last name + DOB | name + DOB | `registrations/index.tsx:132-153`, `registrationDuplicates.ts:15` |
| **Report cards** | **copy DOB into every report card**; the Report Builder offers a DOB column | DOB (denormalised) | `generateReportCard.ts:345`, `firebase.ts:793`, `ReportCardPDF.tsx:412`, `reportBuilder.ts:82,301` |
| **Registration → account** | pre-fills the create form from the registration | DOB etc. | `ConvertToAccountsPanel.tsx:254` |

**Observation.** Almost every bulk read needs only non-PII fields; PII is needed for **one person at a time** (edit form, detail page, own profile, report-card render, duplicate check). That is what makes the split cheap to serve: a directory endpoint plus a detail endpoint.

### 2.3 How it is written today

- **Create:** browser, secondary Auth app, one `batch.set(users/{uid}, {…all fields…})` (`AdminCreateUserForm.tsx:584-624`); bulk import writes the same shape (`import/index.tsx`); registration conversion embeds the same form.
- **Edit:** `StudentForm`/`TeacherForm`/`ParentForm`/`InstitutionAdminForm` `updateDoc` with canonicalised phones (`StudentForm.tsx:197-201`); the profile page writes `name/phone/emergencyContact` for **super_admin only** (rules allow just that role to edit those on their own doc).
- **Rules:** admins may update **any** field of any non-admin user in their institution except `role`/`institutionId` (no field validation); owners may write only `toursCompleted` and `mustChangePassword → false` (`firestore.rules:350-367,404-411`).

### 2.4 Rules that currently expose PII

`users/{uid}` read (`firestore.rules:382-385`): the owner; admins in the institution; **any teacher in the institution for any student**; a parent for a linked child. All four read the *whole* document, PII included.

---

## 3. Field classification

**Legend.** *Public* = stays on `users/{uid}` (client-readable under rules, may be cached). *Private* = moves to `users/{uid}/private/profile` (**BE-only**).

| Field | Class | Why | Notes |
|---|---|---|---|
| `uid`, `role`, `institutionId`, `status` | Public | identity + tenancy; rules and sign-in depend on them | `role`/`institutionId` immutable; also mirrored as **custom claims** (BE-set) |
| `name`, `firstName`, `lastName` | Public | needed in every roster, picker and audit display | names are identifying but required for teaching-day screens |
| `classId`, `houseId`, `houseName`, `departmentId`, `department` | Public | roster/filter keys | queries filter on these |
| `institutionStudentId` | Public | school-internal id shown in class/house/assignment rosters (`list/classes/[id]:106`, `list/houses/[id]:168`, `assignments/[id]:399`) | low sensitivity; uniqueness checks move to the BE |
| `assignedClassId/Name`, `homeroomRoom/Building`, `canGenerateSchedule` | Public | staff timetable/homeroom data | |
| `gender` | Public (**policy call**) | shown in the Students table and used by `CountChart`; a demographic, not on the report's PII list | Move to private if you want it hidden from teachers; then `GET /counts?groupBy=gender` still works server-side |
| `mustChangePassword`, `toursCompleted`, `sessionResetAt` | Public | owner-writable flags/bookkeeping and the sign-in lock check | `mustChangePassword` becomes a **claim** (`pwChangeRequired`) enforced by the BE; the flag stays for the UI |
| `createdAt`, `createdBy`, `updatedAt` | Public | | |
| **`email`** | **Private** | contact PII; the Auth record already holds it for sign-in | admin pickers that show e-mail (parent link dropdown, `students/[id]:186`) switch to the detail endpoint or show name only |
| **`phone`, `phone2`** | **Private** | contact PII | stored canonicalised (`phone.ts`) |
| **`idNumber`** (TRN / Citizen ID) | **Private** | national identifier; highest sensitivity | uniqueness enforced by the BE (§8) |
| **`dateOfBirth`** | **Private** | minors' PII; also a denormalisation risk (§4.2) | |
| **`address`** | **Private** | | |
| **`emergencyContact`** | **Private** | | |
| **`linkedAccounts`** | **Private** | free-text; content unknown **[VERIFY]** | appears on the profile page (`profile/index.tsx:604`) |
| *(photo)* `users/{uid}/photo/current` | T1, already separate | | served by `GET /photos`; stored as bytes by the file work |

**Private-profile schema (v0).** `users/{uid}/private/profile` = `{ uid, institutionId, email?, phone?, phone2?, idNumber?, dateOfBirth?, address?, emergencyContact?, linkedAccounts?, createdAt, updatedAt, schemaVersion }`. `institutionId` is **duplicated** into it so a Firestore collection-group query (or the BE's own tenant check) never needs the parent.

---

## 4. Target model

### 4.1 Documents

```
users/{uid}                      ← public profile (client-readable; no PII)
users/{uid}/photo/current        ← T1 (already separate)
users/{uid}/private/profile      ← T1 PII, BE-only (rules: read, write = false)
institutions/{id}/uniqueKeys/{type}:{hash}   ← BE-only uniqueness registry (§8) [new]
```

### 4.2 Other places PII is duplicated (must be handled, or the split leaks)

| Copy | Where | Treatment |
|---|---|---|
| **Date of birth on every report card** | `generateReportCard.ts:345`, `firebase.ts:793`, rendered at `ReportCardPDF.tsx:412`, Report Builder column `reportBuilder.ts:82,301` | Stop writing DOB into new cards; the BE report generator reads the private profile when it renders/returns a card for an authorised viewer; **backfill removes `dateOfBirth` from existing `reportCards`**; the Report Builder DOB column is served by a BE endpoint (admin only) |
| **Registration submissions** | `enrollmentRegistrations.student/mother/father` (`firestore.rules:1916-1999`) | already admin-read-only; moves to BE reads in its own slice (architecture spec §4.1) |
| **Auth `photoURL`** | `AdminCreateUserForm.tsx:575` pushes the whole photo data URL into the Auth profile | stop doing it (display uses Firestore, not Auth) |
| **Audit `targetName`** | audit entries carry a display name | not PII beyond the name; unchanged |
| **Browser caches** | `sms_query_cache` (sessionStorage) holds the full user directory; Firestore IndexedDB cache | after the split these hold the public projection only; the persister `buster` is bumped (and includes `uid`) so pre-split caches are discarded |

### 4.3 Sign-in stays independent of the BE

`AuthContext` keeps reading **only** the public `users/{uid}` doc (role, status, institutionId, name, classId, departmentId, department, mustChangePassword, sessionResetAt). The four PII values it loads today (`phone, address, emergencyContact, linkedAccounts` → context, `AuthContext.tsx:158-163`) are **removed from sign-in**; the profile page fetches them on demand from `GET /v1/me/private`. This preserves decision D5: a sleeping BE can slow the profile page, never block login.

---

## 5. Access policy for the private profile

The authoritative table lives in the shared role-policy package; this is the intended v0 outcome and the **decisions I need from you** (§13).

| Viewer → subject | Private profile | Notes |
|---|---|---|
| `super_admin` → anyone | ✔ all fields | audited read of a student's identifiers (optional) |
| `institution_admin` → user in own tenant | ✔ all fields | cannot read another admin's private profile unless `super_admin` |
| teacher (`senior`/`regular`) → student they teach | **none by default** | **Policy decision A:** today every teacher reads every student's full doc. Recommended default: public projection only; optionally `emergencyContact` for the class/homeroom teacher |
| teacher → anyone else | none | |
| parent → linked child | ✔ limited (e.g. `dateOfBirth`, `emergencyContact`) | **Policy decision B:** which fields |
| student → self | ✔ all own fields | |
| any user → self | ✔ own private profile | via `GET /me/private` |

Every denial is `404 not_found` (indistinguishable from a missing user in another tenant).

---

## 6. How the SPA changes (by consumer)

| Consumer | Change |
|---|---|
| `AuthContext` | drop the four PII values from sign-in/refresh; keep own-profile read client-side (§4.3) |
| `useInstitutionUsers` and the 4 admin list pages | read the **directory endpoint** (public projection) — a smaller payload, safe to cache; stop persisting full user docs |
| Student/Teacher/Parent edit forms | on open, `GET /users/{uid}` for the private part (or one detail call that also returns the public part); save with `PATCH /users/{uid}` |
| `AdminCreateUserForm`, import, registration conversion | `POST /users` (BE creates Auth user + public + private docs + claims + audit); the browser's secondary Auth app and the client-side one-time-password literals go away |
| `students/[id]` detail page | public doc may stay a live listener; DOB/ID/phones from `GET /users/{id}` (`no-store`, memory only) |
| Roster/picker queries (~50 sites) | unchanged where they use public fields (still direct reads, per D4 they use the memory-cache instance); migrate opportunistically |
| `UserCard`, `CountChart` | `GET /counts` (also removes whole-collection listeners) |
| Uniqueness checks | the BE does them (§8); the client-side `getDocs where idNumber ==` calls are removed |
| Registration duplicate check | BE endpoint (reserved in OpenAPI §5) instead of reading every student's name + DOB in the browser |
| Report cards / Report Builder | BE generation/serving; no DOB copy stored |
| Profile page | `GET /me/private`; `super_admin` self-edit via `PATCH` |

---

## 7. Firestore rules — before / after

**Before** (`firestore.rules:350-411`, abridged): owner/admin/teacher/parent read the whole `users/{uid}`; admins update any field except `role`/`institutionId`; owners write `toursCompleted` and `mustChangePassword → false`; only `super_admin` deletes.

**After (target):**

```
match /users/{uid} {
  // public profile only — contains no PII after the backfill
  allow read: if (unchanged clauses: owner, admin in tenant, teacher for students in tenant, parent for linked child);
  // privileged fields are written by the BE (Admin SDK bypasses rules)
  allow create, delete: if false;
  allow update: if isOwner(uid) && roleNotChanged() && institutionNotChanged()
                && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['toursCompleted'])
                && <toursCompleted size cap>;     // mustChangePassword is cleared by the BE
}
match /users/{uid}/private/{doc} {
  allow read, write: if false;                     // BE only
}
```

**Deploy order is part of the design** (two whole-file rules-deploy incidents are already on record): *BE endpoints live → SPA slice switched → rules tightened for that slice*. Never deploy the `private` deny and the create/update lock before the SPA slice that stops using them is live, or the old bundle breaks. Rules changes ship only with **Emulator tests** (cross-tenant × role matrix) as a pre-deploy gate.

---

## 8. Indexes and uniqueness

Current `users` composite indexes (`firestore.indexes.json`): `institutionId+role+classId`, `institutionId+role+institutionStudentId`, `institutionId+idNumber`. The first two stay (public fields). The third becomes obsolete because `idNumber` moves.

**Uniqueness for `idNumber` (and optionally `institutionStudentId`).**

| Option | Pros | Cons |
|---|---|---|
| **A. `uniqueKeys` registry (recommended)** — the BE creates `institutions/{id}/uniqueKeys/{type}:{sha256(normalised value)}` in the **same transaction** as the user | atomic (closes today's check-then-write race), no index, no query | extra doc per unique value (writes) |
| B. Collection-group query on `private` (`institutionId`, `idNumber`) | no extra docs | needs a new collection-group composite index; still check-then-write unless wrapped in a transaction |

The registry collection is BE-only (rules deny clients) and holds only hashes.

---

## 9. Migration plan (expand / contract)

Quota context: Spark gives 20 K writes / 50 K reads / 20 K deletes per day, shared with production traffic. With ~2,500 seed accounts plus the real ones, a backfill is ≈ 2 reads + 1 write per user, and the cleanup pass ≈ 1 write per user — well inside a day, but it must be paced and run when real traffic is low. **Run against staging first.**

| Step | What | Reversible? |
|---|---|---|
| 0 | BE `GET /users/{uid}` reads `private/profile` **if present, else falls back to the public doc's PII fields** (BE-only fallback) | yes |
| 1 | **Backfill script** copies PII fields → `users/{uid}/private/profile` (`institutionId` duplicated, `schemaVersion`), then deep-equals each copy against its source (the pattern in `scripts/migrate-to-institutions.mjs`). **Public docs unchanged.** | yes (delete the private docs) |
| 2 | **Slice by slice**, flag the SPA to the BE: directory + counts → detail/edit → own profile → duplicate check → report-card path. Public docs still contain PII, so any slice can be rolled back instantly | yes (flip flag) |
| 3 | BE **stops writing PII to the public doc**; `POST /users`/`PATCH` write only the private doc | rollback = re-enable dual-write |
| 4 | **Contract:** script removes the PII fields from public docs (`FieldValue.delete()`), removes `dateOfBirth` from existing `reportCards`; **then** deploy the tightened rules (§7). Bump the TanStack persister `buster`; stop writing Auth `photoURL` | **only via the backfill's saved before-snapshot / a reverse script** |
| 5 | Remove the step-0 fallback; drop the obsolete `idNumber` composite index; update docs/tests | — |

**Script contract (all migration scripts)** — per the security report's script rules: dry-run by default with an explicit `--live`; print and **assert the resolved project id** (`--project=<id>`), no silent `applicationDefault()` fallback; typed confirmation for the destructive contract step; `--institution=<id>` scope flag; resumable checkpoint; pacing (reuse `AUTH_CONCURRENCY`/`CHUNK_PACING_MS`/`withQuotaRetry` ideas from `reset-role-default-passwords.mjs`, and `BATCH_LIMIT=450`); PII-free logs (counts and ids only); the before-snapshot is written to an **encrypted/offline** location and deleted after verification (the phone-backfill before-files are an example of what *not* to leave on disk). A shared `scripts/lib/admin.mjs` does not exist yet and should be created first.

**Verification gates before step 4:** (1) 100 % of users have a verified private doc; (2) a sampled staging walk-through of every slice as every role; (3) Emulator rules tests green; (4) no SPA bundle in the field still reads PII from the public doc (check by version/flag, not hope).

---

## 10. Scripts, e2e and tooling affected

| Item | Impact |
|---|---|
| `scripts/backfill-nanp-phone-format.mjs` (`:171-185`) | operates on `users` phone fields → **retarget to `private/profile`** (and keep its before-values backup out of the repo) |
| `scripts/seed-bulk-institution.mjs` (~14 PII writes) | write the public doc **and** the private doc; otherwise seeded users have no PII after step 4 |
| `scripts/teardown-bulk-institution.mjs` (`:351` deletes `db.collection('users').doc(uid)`) | Firestore does not cascade — it must also delete `users/{uid}/private/profile` (and already-orphaned `photo`/`activity_log` today) |
| `scripts/reset-role-default-passwords.mjs` (`:175-183,303`) | reads only `role/status/institutionId` from the public doc — **no change**; (the role-default password model is being replaced by BE random one-time passwords) |
| `e2e/` specs that read/write `users` via the Admin SDK or fill the forms | update fixtures; **do not** run against production (tracked separately) **[VERIFY: grep `e2e/` for PII field names]** |
| `firestore.indexes.json` | remove the `institutionId+idNumber` composite after step 5; add a collection-group index only if Option B is chosen |
| Docs | `docs/compliance/LEGAL_AND_PRIVACY_COMPLIANCE.md` §3.4 storage inventory, `docs/firebase/firebase-rules.md`, `sms-role-specification-v1.md` field/visibility statements, `FIRESTORE_READ_CACHING_SPEC.md` (§4 pilot hook now returns the public projection) |

---

## 11. Test plan

- **Emulator rules suite** (`@firebase/rules-unit-testing`): for `users/{uid}` and `users/{uid}/private/*` assert allow/deny for {anonymous, self-registered account with no doc, student (self/other), parent (linked/unlinked), regular/senior teacher (student in/out of their classes), institution_admin (own/other tenant), super_admin}; assert clients **cannot** read or write `private`, cannot create/delete users, and that the owner write is limited to the `toursCompleted` allow-list.
- **BE integration tests** (Emulator): create → read private as each role → patch → status change → claims/revocation; policy-table table-driven tests; uniqueness race (two concurrent creates with the same `idNumber`).
- **Migration tests:** backfill on a seeded staging project, deep-equal verification, idempotency (re-run is a no-op), resume after interruption, rollback drill.
- **Browser checks:** after each slice, DevTools → no PII in sessionStorage/IndexedDB/HTTP cache for the BE-served paths; the Network tab shows the public projection only for list pages; `Cache-Control: no-store` present on every PII response.
- **Regression:** sign-in with the BE asleep (must still succeed — §4.3); attendance marking and gradebook unaffected.

---

## 12. Risks and open items

1. **Inventory completeness.** The reader/writer table in §2 is from targeted searches; before implementation, run an exhaustive `git grep` for each private field across `src/`, `scripts/`, `e2e/` and attach the result to the slice's PR. Known extra hits to confirm: `data.ts` (mock data, 60 matches — dead in production), `importResults.ts`, `reports/builder/index.tsx:67`.
2. **Teachers' Students/Teachers/Parents list pages.** The sidebar shows these to teachers, but the shared hook's unfiltered institution query would be rejected by the teacher rule for non-student documents (rules are not filters) **[VERIFY how teachers reach this page today]** — the directory endpoint removes the ambiguity.
3. **Denormalised DOB in existing report cards** requires the backfill in §4.2, otherwise PII survives outside `users`.
4. **`gender` and `email` placement** are judgement calls (§3) — reversible by moving a field between the two documents before step 3.
5. **Quota during backfill/contract** — schedule off-peak; staging first.
6. **Cache purge:** old bundles/sessions that still hold a pre-split `sms_query_cache` are invalidated by the buster bump; confirm the persister's `maxAge` (30 min) and `gcTime` interplay so no PII lingers longer than expected.
7. **Realtime Database files (interim store).** Teacher and admin lesson-note / assignment files over 500 KB live in the Realtime Database (docs/miscellaneous-specs/LARGE_ATTACHMENTS_RTDB_SPEC.md), outside `users` and outside the Firestore rules: any signed-in account holding a file's unguessable key can read it, and the database cannot check roles. They are teaching material, not profile data, but may name students. They are not part of this split; they move behind the BE with the files work (architecture spec, phase 4).
8. **Legal:** the Privacy Notice's "what is collected/where stored/who sees it" statements and the processor list must match the new model and the new processor (the BE host) before real data flows.

---

## 13. Decisions needed from you

| # | Decision | Recommendation |
|---|---|---|
| A | Which private fields (if any) may a teacher see for students they teach? | none, except optionally `emergencyContact` for the class/homeroom teacher |
| B | Which private fields may a parent see for a linked child? | `dateOfBirth`, `emergencyContact`; not `idNumber` |
| C | Keep `gender` public (Students table, dashboard chart) or make it private? | public |
| D | Uniqueness: registry (Option A) or collection-group query (Option B)? | A |
| E | Is `email` private (admin detail only) or acceptable in the directory for admins? | private; admin lists show name only |
