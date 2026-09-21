# Registration Form Builder — Feature Spec

Status: **Speced, not implemented.** This is a design document, written before any code, per this project's established convention for architecturally significant features (see `docs/attendance/ATTENDANCE_REGISTER_SPEC.md`, `docs/report-card/REPORT_CARD_SPEC.md`, `docs/subject-form/SUBJECT_FORM_SPEC.md`). It should be kept in sync with whatever is actually learned while implementing, the same way `docs/seed/BULK_SEED_SPEC.md` was.

Origin: item 12 of `sms-system/internal/dev-notes/issues-that-were-discovered-while-accessing-the-live-site-after-the-seed-began.txt` — *"implement logic to allow the inst_admin-role user to set/customize the [registration] form to suit the institution."* Full triage context (why this was deferred out of the other 13 items in that file, and how it compares to them) is in `sms-system/internal/analyses/` (see that directory's writeup for this same triage pass).

## 1. Scope Decisions (v1)

Three scope forks were resolved with the project owner before writing this spec — they shape every section below:

1. **Fixed fields only, not arbitrary custom fields.** Admins can hide, relabel, and toggle required/optional on the *existing known field set* (enumerated in [§4](#4-configurable-field-inventory)). No admin-defined field types, no generic `customFields` map. A future v2 could add that; this spec deliberately does not design for it, to avoid over-building.
2. **Full versioning.** Every published config change creates a new immutable version. Each `enrollmentRegistrations` submission records which version was active when it was submitted, so the admin review UI always renders a historical submission against the config that was actually live at the time — never against whatever the config has since changed to.
3. **Settings-panel UI, not a drag-and-drop builder.** Per field: visible?, required?, label text. No reordering (the field *order* stays fixed, matching the current form's layout) — matches this app's existing settings-page conventions (`brand-settings/index.tsx`, `institution-profile/index.tsx`), and avoids pulling in a drag-and-drop library this project doesn't currently depend on.

## 2. Why This Is Bigger Than It Looks

Investigated directly against the current codebase before writing this spec (not assumed):

- The public registration form (`src/scenes/(auth)/register/[institutionId]/index.tsx`) is **100% hardcoded** — its field set is a single zod `schema` object plus static JSX in one 588-line file. There is no existing data-driven-forms infrastructure anywhere in this app to build on. This is genuinely the largest single build among the 13 dev-notes items it was triaged alongside.
- The `enrollmentRegistrations` Firestore create rule (`firestore.rules:1313-1323`) uses `hasAll()` **and** `hasOnly()` together to pin the submitted document to an *exact* field set — not just "at most these fields" but "exactly these fields, several of them unconditionally required." Making a currently-required field admin-configurable-as-optional is a **security rules change**, not just a UI change. See [§6](#6-requiredness-enforcement--rules-vs-client-a-deliberate-tradeoff).
- `institutions/{institutionId}` is **not** publicly readable (`firestore.rules:719-725`: only that institution's own signed-in staff or `super_admin`). Only `registration_directory/{institutionId}` is (`allow read: if true`, `firestore.rules:736`). Any config data the *public* registration page needs must live in, or be mirrored into, `registration_directory` — exactly how `activeAcademicYearId`/`activeAcademicYearName` already work today. This is a real architectural constraint, not a style choice.

## 3. Architecture at a Glance

```text
institutions/{institutionId}/registrationFormConfigs/{versionId}   ← admin-only, full history, immutable once published
registration_directory/{institutionId}                              ← existing public doc, gains one new field:
    activeRegistrationFormConfig: { ...mirrored current version... }

institutions/{institutionId}/enrollmentRegistrations/{registrationId} ← existing collection, gains one new field:
    formConfigVersion: string   // which version was active at submission time
```

Publishing a config change is one batched write: create the new `registrationFormConfigs/{versionId}` doc, and overwrite `registration_directory/{institutionId}`'s `activeRegistrationFormConfig` mirror — same batching discipline already used elsewhere in this app for keeping a directory mirror in sync with its source of truth.

The public registration page's existing `useEffect` (currently `getDoc(doc(db, "registration_directory", institutionId))`, lines 282-297) needs no new read — `activeRegistrationFormConfig` arrives on the same document it already fetches.

## 4. Configurable Field Inventory

Per-field config shape (applies uniformly to every row in the tables below):

```ts
type FieldConfig = {
  visible: boolean;
  required: boolean;   // ignored if visible is false
  label: string;        // display label; empty/missing falls back to the hardcoded default
};
```

**Hard floor — always required, never configurable**, regardless of what an admin sets. A registration with none of these is not a usable lead; this mirrors the existing accepted-risk posture the codebase already uses for `MIN_AGE_YEARS` (client-enforced, not a rules primitive) rather than inventing a new one:

| Field | Today's status |
| --- | --- |
| `student.lastName`, `student.firstName`, `student.email` | Already `hasAll()`-required |
| Guardian `lastName`, `firstName`, `email` (whichever of mother/father is included) | Already `hasAll()`-required |

**Configurable (visible/required/label)**:

| Field | Today's status (hardcoded) | Notes |
| --- | --- | --- |
| `student.middleName` | Optional | Already skippable — config just adds label/visibility control |
| `student.requestedClass` | Required | |
| `student.dateOfBirth` | Required | `MIN_AGE_YEARS` check only applies if visible+required — see [§6](#6-requiredness-enforcement--rules-vs-client-a-deliberate-tradeoff) |
| `student.gender` | Required | |
| `student.lastSchoolAttended` | Optional | |
| `student.phone`, `student.phone2`, `student.citizenId` | **Not yet built** — planned separately (dev-notes items 6). Designed for here so the config schema doesn't need a breaking change once those fields ship; see [§10](#10-interaction-with-other-planned-work) |
| Guardian `address` | Required | Applies independently to mother/father |
| Guardian `contact` | Required | |
| Guardian `occupation` | Required | |
| Guardian `work` | Optional | |

**Not per-field — section/page-level settings**:

| Setting | Shape | Behavior |
| --- | --- | --- |
| `parentSectionEnabled` | `boolean` | If `false`, the entire "Add mother's/father's information" section (and its "at least one parent required" `superRefine` check) is hidden and skipped — for an institution type where guardian info doesn't apply. |
| `timeFrameMode` | `'academicYear' \| 'academicTerm' \| 'custom'` | Controls what shows in the form header (currently hardcoded to `activeAcademicYearName`, line 433). `'academicTerm'` requires mirroring `activeTermId`/`activeTermName` into `registration_directory` the same way `activeAcademicYearId`/`Name` already are (§7.4 of `docs/seed/BULK_SEED_SPEC.md` documents that this exact mirroring gap was discovered once before, for the seed script — same mechanism, same lesson). `'custom'` uses `customTimeFrameLabel` below verbatim, no resolution needed. |
| `customTimeFrameLabel` | `string?` | Only read when `timeFrameMode === 'custom'`. |

## 5. Data Model

```ts
// institutions/{institutionId}/registrationFormConfigs/{versionId}
type RegistrationFormConfigVersion = {
  version: number;              // monotonically increasing per institution, starts at 1
  publishedAt: Timestamp;
  publishedBy: string;          // uid of the admin who published it
  fields: Record<ConfigurableFieldKey, FieldConfig>;  // see §4's "Configurable" table
  parentSectionEnabled: boolean;
  timeFrameMode: 'academicYear' | 'academicTerm' | 'custom';
  customTimeFrameLabel?: string;
};

// registration_directory/{institutionId} — existing doc, new field
type RegistrationDirectoryEntry = {
  // ...existing fields unchanged (name, logoUrl, acceptingRegistrations,
  // activeAcademicYearId, activeAcademicYearName, ...)...
  activeRegistrationFormConfig?: RegistrationFormConfigVersion;  // absent = use hardcoded defaults, see §9
  activeTermId?: string;      // only needed if any institution ever sets timeFrameMode: 'academicTerm'
  activeTermName?: string;
};

// institutions/{institutionId}/enrollmentRegistrations/{registrationId} — existing doc, new field
type EnrollmentRegistration = {
  // ...existing 9 fields unchanged...
  formConfigVersion: number;   // RegistrationFormConfigVersion.version this submission was rendered against
};
```

`ConfigurableFieldKey` is a string-literal union of exactly the rows in §4's "Configurable" table (e.g. `'student.middleName' | 'student.requestedClass' | ... | 'guardian.work'`) — deliberately closed, not a free-form string, so a typo in a field key can't silently produce a config that matches nothing.

## 6. Requiredness Enforcement — Rules vs. Client (a deliberate tradeoff)

This is the one real security-design decision in this spec, so it's worth stating explicitly rather than leaving implicit.

**The problem:** `isValidRegistrationStudent()`/`isValidRegistrationGuardian()` (`firestore.rules:126-154`) currently use `hasAll()` to make `requestedClass`, `dateOfBirth`, `gender`, guardian `address`/`contact`/`occupation` unconditionally required at the rules layer, for every institution, no exceptions. Making these admin-configurable-as-optional means the rules layer can no longer hard-require them uniformly.

**Two ways to solve this:**

- **(a) Rules read the active config via `get()`** before validating — Firestore rules can call `get()`/`exists()` against another document (the same mechanism `enrollmentRegistrations`'s own create rule already uses for `academicYears`, line 1319). This keeps requiredness enforced server-side per-institution, at the cost of an extra rules-evaluation read on every submission and meaningfully more complex rule logic (the rule would need to loop or branch over every configurable field key).
- **(b) Drop these six fields' rules-layer requiredness to "optional if absent, validated if present,"** keep only the §4 hard-floor fields (`lastName`/`firstName`/`email` for student and guardian) unconditionally required at the rules layer, and enforce the *institution's actual* requiredness choice entirely client-side in the dynamically-built zod schema.

**Decision: (b).** This isn't a new risk being introduced — it's the same accepted tradeoff this exact form already makes for `MIN_AGE_YEARS` (`register/[institutionId]/index.tsx:19-31`, comment: *"Enforced client-side only — Firestore rules have no clean 'N years ago' primitive, and a bypass here just means an underage-looking submission reaches the pending review queue, same as any other bad-data submission."*). A bypassed client-side requiredness check here has the identical failure mode: an incomplete-looking submission lands in the same admin-reviewed `pending` queue every other registration already goes through — nothing auto-converts to a real account without a human. (b) is also dramatically simpler to implement and reason about than (a), and avoids adding `get()` calls (and their read-quota cost) to a public, unauthenticated write path — the exact path this codebase's own `docs/miscellaneous-specs/STUDENT_REGISTRATION_FORM_SPEC.md` §App Check section already flags as needing the most defensive caution, since it's *"the app's first-ever unauthenticated write."*

Net rules change to `isValidRegistrationStudent`/`isValidRegistrationGuardian`: their `hasAll()` lists shrink to the §4 hard floor only; their `hasOnly()` lists (the upper bound) grow to include every §4 configurable field, all now optional-if-present with the same type/format checks they already have today.

## 7. Public Registration Form — Dynamic Rendering

`register/[institutionId]/index.tsx`'s current hardcoded `schema` (lines 120-172) and JSX (lines 417-586) both need to become config-driven:

- Build the zod schema at render time from `directory.activeRegistrationFormConfig` (falling back to hardcoded defaults per [§9](#9-migration--backward-compatibility) if absent) — a field's zod validator becomes conditional on `fields[key].visible` and `fields[key].required`, reusing the existing `requiredName`/`optionalName`/`requiredText`/`optionalText` helper factories (lines 57-98) unchanged, just choosing between the required/optional variant per-config instead of hardcoding one.
- JSX: each field's `<label>` block gets wrapped in `{config.fields['student.requestedClass'].visible && (...)}`, and its label text becomes `{config.fields['student.requestedClass'].label || "Requested class/grade"}` (config label overrides the hardcoded default; empty/missing config label falls back exactly like `RegistrationFormConfigVersion.fields`'s type comment states).
- `GuardianFields` (lines 191-271) takes the same treatment; since it's already a shared component parameterized by `prefix: "mother" | "father"`, the config lookup key becomes `` `guardian.${field}` `` regardless of which parent is being rendered — the same config applies to both.
- On submit, include `formConfigVersion: directory.activeRegistrationFormConfig?.version ?? 0` (`0` reserved to mean "pre-versioning, hardcoded defaults" — see §9) in the `addDoc` payload (line 345-377).

## 8. Admin Builder UI

New scene, e.g. `src/scenes/(dashboard)/registration-form-builder/index.tsx`, `institution_admin`-only (matches `brand-settings`/`institution-profile`'s existing permission pattern — no `super_admin`-specific behavior needed here, this is entirely per-institution).

Settings-panel layout (per [§1](#1-scope-decisions-v1) item 3): one row per §4 configurable field — a "Visible" checkbox, a "Required" checkbox (disabled/greyed when Visible is unchecked), and a text input for the label override, grouped under "Student Information" / "Mother's Information" / "Father's Information" headers matching the public form's own section structure. Plus: the `parentSectionEnabled` toggle, and a `timeFrameMode` select + conditional `customTimeFrameLabel` input.

A single "Publish Changes" action performs the batched write described in [§3](#3-architecture-at-a-glance) — no autosave/draft state for v1 (matches `institution-profile`'s existing wizard pattern: edits are local component state until an explicit save action).

## 9. Migration / Backward Compatibility

Every institution that exists before this ships has no `registrationFormConfigs` documents and no `activeRegistrationFormConfig` on its `registration_directory` entry. The public form must treat a missing config as **exactly today's hardcoded behavior** — every §4 field visible and required (matching its current status column), `parentSectionEnabled: true`, `timeFrameMode: 'academicYear'` — so this ships with zero behavior change for every existing institution until its admin actively opens the builder and publishes a config. `formConfigVersion: 0` on a submission means "submitted before this institution ever published a config" — the admin review UI should render version `0` using this same hardcoded-defaults fallback, not fail to find a `registrationFormConfigs/0` document that will never exist.

## 10. Interaction with Other Planned Work

- **Dev-notes item 6** (add `student.phone`, `student.phone2`, `student.citizenId` to the registration form) is not yet built. This spec's §4/§5 already reserve config slots for them so that whichever ships first, the other doesn't require a breaking schema change. If item 6 ships first, add its three fields to `isValidRegistrationStudent()`'s `hasOnly()` list as optional (following the pattern already established for `middleName`/`lastSchoolAttended`) — independent of this spec.
- **`docs/miscellaneous-specs/STUDENT_REGISTRATION_FORM_SPEC.md` §Photo Upload — Design (Implementation Deferred)** (lines 517-564 of that file) already fully speced a `photoPath` field, Storage path shape, and Storage rules for photo upload — deliberately not yet implemented. This spec's `ConfigurableFieldKey` union should add a `'student.photo'` entry once that ships, following the same visible/required/label shape as every other row in §4 — no new mechanism needed, just one more entry in the union.
- **Dev-notes item 14** (document uploads — birth certificates, medical records, etc., beyond just a photo) is broader than the already-speced photo upload and remains fully unspeced. Out of scope here.

## 11. Firebase Impact Summary

- **Firestore rules**: yes — `isValidRegistrationStudent`/`isValidRegistrationGuardian` requiredness loosened per §6; `enrollmentRegistrations`'s `hasAll()`/`hasOnly()` lists gain `formConfigVersion`; new `institutions/{institutionId}/registrationFormConfigs/{versionId}` match block (admin read/write, mirrors `academicYears`' existing permission shape); `registration_directory`'s existing `allow write` rule already covers the new `activeRegistrationFormConfig`/`activeTermId`/`activeTermName` fields without changes (no `hasOnly()` on that collection's rule today).
- **Firestore indexes**: none anticipated — no new range/multi-equality queries introduced; `registrationFormConfigs` is read by ID (current version) or listed unfiltered per institution (history view), neither needs a composite index.
- **App Check**: already implemented client-side (`src/lib/firebase.ts:34-48`) and already covers this exact unauthenticated-write surface per its own design (`docs/miscellaneous-specs/STUDENT_REGISTRATION_FORM_SPEC.md` §Firebase App Check) — confirm enforcement is actually toggled on in the Firebase Console before treating this as protected; that toggle is a manual, separate step from the code being present.
- **Cloud Functions / Storage**: none needed for this spec as scoped (fixed fields only, no file uploads — see §10 for how photo upload would layer in separately).
- **Billing plan**: no impact — everything here is Firestore reads/writes/rules, well within Spark-plan mechanics already used elsewhere in this app.

## 12. Implementation Order

1. `RegistrationFormConfigVersion` type + `ConfigurableFieldKey` union in `src/lib/firebase.ts`.
2. Firestore rules changes (§6, §11) — land and deploy independently of app code, verified against existing `STUDENT_REGISTRATION_FORM_CODE_REVIEW_FINDINGS.md`-style scrutiny given this touches an already-hardened rule.
3. Admin builder UI (§8), writing to `registrationFormConfigs` + mirroring into `registration_directory`.
4. Public form dynamic rendering (§7), with the §9 fallback-to-hardcoded-defaults path built and tested *first*, before the builder UI ships — so existing institutions are provably unaffected even mid-rollout.
5. Admin review page (`/dashboard/registrations`) updated to resolve and display `formConfigVersion` against its historical config when reviewing older submissions.

## 13. Deferred / Out of Scope (v1)

- Arbitrary custom fields with admin-defined types (§1).
- Drag-and-drop field reordering (§1) — field order stays fixed.
- Document/photo uploads (§10) — layers in separately once each of those ships on its own.
- A config "preview" mode for the admin to see the public form as a visitor would before publishing — worth doing, not required for a functional v1.
