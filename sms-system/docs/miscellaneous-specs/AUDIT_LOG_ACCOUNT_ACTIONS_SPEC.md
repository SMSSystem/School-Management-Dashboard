# Cross-Account Audit Logging — Feature Spec

> **Status:** Revised 2026-10-02. Partly shipped, partly planned. The account-suspension half of the original spec shipped in PR #66 as account **deactivation** (see §3); the remaining writers, the teacher rule extension and the "actions I performed" feed are still planned. Spec written before code, per this repo's standing convention.
> **Feature:** Closes the gap between what `AuditLogEntry` (`src/lib/firebase.ts`) was designed to record and what is actually written. Adds real logging for account creation, profile-field edits, password resets and schedule-access permission changes; opens `audit_log` create (and an owner-scoped read) to teachers at the rules level; and shows an admin the actions their own account performed on other people's data.
> **Route:** No new routes. Affected: `/dashboard/profile` (Activity section, admins), `/dashboard/list/students`, `/dashboard/list/teachers`, `/dashboard/list/parents` (edit forms), `/dashboard/super-admin/manage-admins` (reset-password cell), `/dashboard/schedule` (delegate-access toggle), and the account-creation form.
> **Primary roles:** Writing entries — `institution_admin`, `super_admin`; `senior_teacher`/`regular_teacher` at the rules level only (no teacher flow writes yet, §8). Reading — admins read their institution's log; teachers read only entries they wrote.
> **Resolves:** Two examples that prompted the original spec — "an `inst_admin` created a `student` account" and "an `inst_admin` updated a `parent`'s phone number" — and `ISSUES_AND_GAPS.md` #11 (admin form actions don't write audit entries). Update #11 when this ships.

---

## 1. Overview

`AuditLogEntry` already has the shape this needs — `targetUid`/`targetName` (whose data changed) next to `performedBy`/`performedByName` (who changed it) — and the collection has a dedicated viewer (`admin/audit-log/index.tsx`). **The infrastructure was never the gap; almost nothing writes to it.**

Of the declared `AuditEventType` values, the live writers today are `photo_change` (the Student, Teacher and account-creation forms), `registration_status_change` (`registrationAudit.ts`), and — since #66 — `account_suspended`/`account_reactivated` (`AccountStatusToggle.tsx`). `account_created`, `password_reset` and `permission_change` are declared and never written, and there is no event at all for ordinary field edits.

This spec adds writers for those three, a new `profile_edit` event for field edits, and the supporting rules, index and read path. `role_change` and `account_deleted` stay deferred (§13).

---

## 2. Background / Investigation Findings

Confirmed against `main` at `3c69872` (after PR #67). Line numbers drift; blocks and functions are named so they can be found again.

- **Every audit write today must carry `recordedAt`.** The `institutions/{id}/audit_log/{eventId}` create rule requires `recordedAt == request.time`, `performedBy == request.auth.uid`, an exact key set (`hasOnly` and `hasAll` over `eventType, detail, targetUid, targetName, performedBy, performedByName, timestamp, institutionId, recordedAt`), an `eventType` from an allow-list, and `detail` a string of at most 300 characters. `timestamp` stays the legacy client ISO string used for ordering and display. Any writer that omits `recordedAt` is denied.
- **The allow-list is `role_change, password_reset, account_created, account_suspended, account_reactivated, account_deleted, permission_change, registration_status_change, photo_change`.** `profile_edit` is not in it, so the rules must change before any `profile_edit` write can succeed.
- **Writes are admin-only in the rules.** The create rule allows `isSuperAdmin()` or `isAdmin()` of that institution. Teachers cannot write. `e2e/11-users-lockdown.spec.ts` ("a teacher writing an audit entry") currently asserts the **denial**, so it must change with this spec (§12).
- **Reads are admin-only** (`isSuperAdmin()` or `isAdmin()` of that institution).
- **Indexes:** the two existing `audit_log` composites are **collection-group** indexes (`eventType`+`timestamp`, `institutionId`+`timestamp`). No collection-scope index exists for a `performedBy` filter.
- **`StudentForm.tsx`'s update handler** builds one `writeBatch` (user update, house `studentIds` arrays, optional photo) and commits it. The photo branch writes `activity_log` + `audit_log` best-effort **after** the commit. Field edits (first/last name, email, phone, phone2, ID number, institution student ID, date of birth, gender, class, house) write no audit entry. `TeacherForm.tsx` is the same split: a batch with the user `set(…, {merge:true})`, `subjects/{id}.teacherIds` updates and an optional photo, then a best-effort photo log filed under the **target's** institution (`targetInstitutionId`, so a super_admin's entry lands where that institution's admin can read it). The teacher form edits first/last name, phone, department, and for senior teachers the homeroom class/room/building and subject assignments — **not email**.
- **`ParentForm.tsx`** is also a batch (`users/{uid}` `set(…, {merge:true})` with first/last name, email and phone, plus `student_parents` links) and has no logging at all. It reads `institutionId` from `useAuth()`, which is the `'*'` sentinel for a super_admin — the target parent's institution must come from the row (`data`) instead.
- **`AdminCreateUserForm.tsx`** commits the Auth account's Firestore profile in a batch; if that batch fails it rolls back by deleting the Auth user. Only a creation-time photo is audited, best-effort and skipped for `super_admin` targets. The creation itself writes no entry.
- **The only live password-reset trigger is `manage-admins/index.tsx`'s `ResetCell`**, receiving just `email`. The page is super_admin-only; its rows are institution admins, and each `Admin` row already carries `id`, `name` and `institutionId`. (`AccountActionsCard.tsx`, once a second competing reset component, no longer exists.)
- **`schedule/index.tsx`'s `handleToggle`** flips `canGenerateSchedule` on a senior teacher's user document. The toggle is rendered only for `institution_admin`, and the update is allowed by the admin clause of the `users` update rule. It writes no trail.
- **`profile/index.tsx` has two separate sections:** "Activity" (the signed-in account's own `users/{uid}/activity_log`, `limit(20)`, available to every role) and "Audit and security events" (admin-only, the institution's last 5 entries from anyone). The new feed merges into **Activity** and leaves "Audit and security events" untouched.
- **`roleNotChanged()` still blocks role edits** at the rules layer, and real deletion of other users' Auth accounts still needs the Admin SDK (no Cloud Functions on Spark). Both deferrals from the original spec stand.
- **`registrationAudit.ts`** already writes `recordedAt: serverTimestamp()`; it is the precedent for a shared helper.

---

## 3. Shipped in PR #66 (formerly Part C — account suspension)

The original spec proposed building suspension (a `SuspendCell`, `status: 'suspended'`, and a client-side gate in `AuthContext`). PR #66 shipped a different, stronger design instead, so none of that is built:

- **Value and wording:** the status is `'inactive'` (admin-facing wording "deactivate"/"reactivate"); `UserStatus` is `'active' | 'inactive'`. Only the literal `'inactive'` deactivates; a missing or other value counts as active (`lib/accountStatus.ts`).
- **UI:** `AccountStatusToggle.tsx` on the students, teachers and parents lists, with a confirmation dialog. It is shown only to `institution_admin`/`super_admin` and never on one's own row. The status change and its audit entry are written in **one `writeBatch`** and the cached row is patched with `setQueryData` instead of refetching.
- **Enforcement is server-side:** `accountActive()` in `firestore.rules` makes `myRole()` and `myInstitutionId()` stop matching for an inactive account, so it loses access to everything except its own user document **immediately**, including in an open session. `AuthContext.tsx` then signs it out with a notice (`INACTIVE_ACCOUNT_MESSAGE`). The original spec's "next sign-in only" limitation no longer applies.
- **Events:** `account_suspended` (deactivate) and `account_reactivated` (reactivate), both in the rules allow-list and the type; `lib/accountStatus.ts#statusAuditEvent` maps one to the other. Covered by `e2e/11-users-lockdown.spec.ts`.
- **Stale leftovers to clean up (separate, small):** `UserDocument.status` in `firebase.ts` still reads `'active' | 'inactive' | 'suspended'`, and the super-admin mock types and `RecentSignups` still say `'suspended'`. `'suspended'` is not a status the app or the rules recognise for users.

Nothing in this section is built by this spec; it is recorded so the remaining parts stay consistent with it (same event naming, same batch-with-the-change pattern).

---

## 4. Design Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Event coverage | `account_created`, `profile_edit`, `password_reset`, `permission_change` | Covers the four reachable, unlogged admin actions. Suspension is already done (§3). |
| Atomicity | `writeBatch` where the primary write already is a batch (Student, Teacher and Parent forms); best-effort after the fact where the action is not a Firestore write (`account_created` after Auth creation, `password_reset` after the email send) or is a lone `updateDoc` (`permission_change`) | Matches `AccountStatusToggle`: a profile edit should never exist without its record. For Auth- and email-driven actions a batch is impossible or would make a log failure roll back a real account. |
| Teacher access | Rules only: teachers may **create** entries (own `performedBy`, same constraints) and **read only their own** (`resource.data.performedBy == request.auth.uid`). No teacher flow writes yet | The user chose to open the rules now. Reads are owner-scoped so teachers never see admin password resets, deactivations or registration decisions. A teacher feed and teacher writers (grade or attendance edits) are future work (§13). |
| Where it is shown | Profile page **Activity** section, **institution_admin only**, as a cached query | Keeps "Audit and security events" untouched and bounds Spark reads (§9). |
| Detail text | List which **fields** changed, never old/new values (e.g. "Updated phone, class for Jane Doe") | Audit entries are permanent (`allow update, delete: if false`); storing values would persist personal data forever. Field names say _what_, not the content. |
| Shared helper | `src/lib/auditLog.ts` exporting `buildAuditEntry()` (the document data, always including `recordedAt`) and `logAuditEvent()` (best-effort `addDoc`), with `logRegistrationAudit` delegating | Four-plus writers repeating the same shape is how `recordedAt` got missed before. A batch caller uses `buildAuditEntry`; a best-effort caller uses `logAuditEvent`. |
| `super_admin` targets | Not logged (same as the existing photo block) | `institutions/*` is not a real institution path, and `institutionId` must equal the path. Documented as a known gap (§13). |
| `profile_edit` event | New event type; `photo_change` stays separate | A photo has no meaningful field diff; the existing `photo_change` messages keep their shape. |

---

## 5. Data Model

No new collections or fields. Changes:

```diff
 export type AuditEventType =
   | 'role_change'
   | 'password_reset'
   | 'account_created'
   | 'account_suspended'
   | 'account_reactivated'
   | 'account_deleted'
   | 'permission_change'
   | 'registration_status_change'
-  | 'photo_change';
+  | 'photo_change'
+  | 'profile_edit';
```

`profile_edit` must also be added to the rules' event-type allow-list (§8) — the type and the rule are separate lists and must stay identical.

---

## 6. Part A — Shared helper

New `src/lib/auditLog.ts`:

```ts
import { addDoc, serverTimestamp } from "firebase/firestore";
import { institutionCollection } from "@/lib/paths";
import type { AuditEventType } from "@/lib/firebase";

export type AuditEventInput = {
  institutionId: string;
  eventType: AuditEventType;
  detail: string;
  targetUid: string;
  targetName: string;
  performedBy: string;
  performedByName: string;
};

const MAX_DETAIL = 300; // firestore.rules: detail.size() <= 300

// The document exactly as firestore.rules require it. Pass to batch.set()
// (with doc(institutionCollection(id, "audit_log"))) or to addDoc().
export function buildAuditEntry(p: AuditEventInput) {
  return {
    eventType: p.eventType,
    detail: p.detail.length > MAX_DETAIL ? `${p.detail.slice(0, MAX_DETAIL - 1)}…` : p.detail,
    targetUid: p.targetUid,
    targetName: p.targetName,
    performedBy: p.performedBy,
    performedByName: p.performedByName,
    timestamp: new Date().toISOString(), // legacy ordering/display
    recordedAt: serverTimestamp(), // server-verified; rules require == request.time
    institutionId: p.institutionId,
  };
}

// Best-effort: callers that cannot batch with the primary write (account
// creation, password-reset email, lone updateDoc) swallow failures themselves.
export async function logAuditEvent(p: AuditEventInput) {
  await addDoc(institutionCollection(p.institutionId, "audit_log"), buildAuditEntry(p));
}
```

`logRegistrationAudit()` becomes a thin wrapper over `logAuditEvent()` (same public signature, so `ConvertToAccountsPanel.tsx` and `registrations/index.tsx` don't change). The three existing `photo_change` writers (`AdminCreateUserForm.tsx`, `StudentForm.tsx`, `TeacherForm.tsx`) and `AccountStatusToggle.tsx` (which can use `buildAuditEntry` in its existing batch) migrate in the same pass so no inline copy of the shape survives. Keep the `activity_log` writes next to the photo logs unchanged.

---

## 7. Part B — Writers

Acting-user fields in every writer: `performedBy: user.uid`, `performedByName: displayName ?? user.email ?? "Administrator"`. **The institution is always the target's**, never the actor's (a super_admin's own is `'*'`); skip the entry when it is missing or `'*'`.

### 7.1 `profile_edit` — Student, Teacher and Parent forms (in the existing batch)

Diff helper, `src/lib/profileEditDiff.ts`, **normalising** before comparing so a form round-trip doesn't report phantom changes:

```ts
const FIELD_LABELS: Record<string, string> = {
  firstName: "first name", lastName: "last name", email: "email", phone: "phone",
  phone2: "second phone", idNumber: "ID number", institutionStudentId: "student ID",
  dateOfBirth: "date of birth", gender: "gender", classId: "class", houseId: "house",
  departmentId: "department", assignedClassId: "homeroom class",
  homeroomRoom: "homeroom room", homeroomBuilding: "homeroom building",
  subjects: "subjects", linkedStudents: "linked students",
};

// undefined, null and "" are the same "empty"; strings are trimmed; Firestore
// Timestamps/Dates compare by millisecond value.
function normalise(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "object" && "toMillis" in v && typeof (v as { toMillis: unknown }).toMillis === "function") {
    return (v as { toMillis(): number }).toMillis();
  }
  return v;
}

export function diffChangedFields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  fields: string[],
): string[] {
  return fields.filter((f) => normalise(before?.[f]) !== normalise(after[f])).map((f) => FIELD_LABELS[f] ?? f);
}
```

- **StudentForm** fields: `firstName, lastName, email, phone, phone2, idNumber, institutionStudentId, dateOfBirth, gender, classId, houseId`. The email wording says the profile record's email changed; the form does not change the Auth sign-in email.
- **TeacherForm** fields: `firstName, lastName, phone, departmentId`, plus for senior teachers `assignedClassId, homeroomRoom, homeroomBuilding`, plus a synthetic `subjects` entry when the set of `selectedSubjectIds` differs from the pre-edit assignment (computed from `subjects[].teacherIds` before the loop runs). No `email`, which this form doesn't edit.
- **ParentForm** fields: `firstName, lastName, email, phone`, plus a synthetic `linkedStudents` entry when the selected student links change. (There is no `address` field on this form.)

**The comparison base is the form's `data` prop** (what the list row passed in). A field the row doesn't carry would always look changed, so a test must cover each form's `data` shape (§12).

Inside the form's existing `onSubmit`, **before** `batch.commit()`:

```ts
const changed = diffChangedFields(data, formData, [/* the form's field list */]);
if (changed.length > 0 && user && targetInstitutionId && targetInstitutionId !== "*") {
  batch.set(
    doc(institutionCollection(targetInstitutionId, "audit_log")),
    buildAuditEntry({
      institutionId: targetInstitutionId,
      eventType: "profile_edit",
      detail: `Updated ${changed.join(", ")} for ${targetName}`,
      targetUid: uid,
      targetName,
      performedBy: user.uid,
      performedByName: displayName ?? user.email ?? "Administrator",
    }),
  );
}
```

`targetInstitutionId` is the row's institution (`TeacherForm` already has it; Student and Parent forms must take it from `data.institutionId` rather than `useAuth()`). **Tradeoff of batching:** a rules rejection of the audit entry now fails the whole save — acceptable (the record and the change stay in step) and covered by the e2e rule probes in §12. The existing post-commit photo logging stays a separate best-effort `logAuditEvent({ eventType: "photo_change" … })`.

### 7.2 `account_created` — `AdminCreateUserForm.tsx` (best-effort, after)

After the successful `batch.commit()` and alongside the existing photo-audit block, for every role **except `super_admin`** (§4):

```ts
try {
  await logAuditEvent({
    institutionId: values.institutionId,
    eventType: "account_created",
    detail: `Created ${roleLabel} account for ${createdName}`,
    targetUid: createdUser.uid, targetName: createdName,
    performedBy: user.uid, performedByName: displayName ?? user.email ?? "Administrator",
  });
} catch { /* best-effort: the account already exists */ }
```

Best-effort, not in the creation batch: that batch is paired with a rollback that deletes the Auth user, and a failed log write must not undo a real account. `roleLabel` should come from an existing label helper if one exists, else a small local map.

### 7.3 `password_reset` — `manage-admins/index.tsx` (best-effort, after)

`ResetCell` receives `{ id, name, email, institutionId }` (already on the row) and, **after** `sendPasswordResetEmail` resolves, logs `Sent password reset email to {name}` under the **target admin's** `institutionId` (skip if absent or `'*'`). The wording is deliberately "sent a reset email": it records the action, not that the password changed. A failed log write is swallowed; the cell still shows "Reset sent".

### 7.4 `permission_change` — `schedule/index.tsx` (best-effort, after)

In `handleToggle`, after the `updateDoc`, log `Granted`/`Revoked schedule-generation access for {name}` against `institutionId` (the admin's own institution, which is also the target's here). Best-effort, since this is a lone `updateDoc`; convert to a batch if a second write is ever added.

---

## 8. Part C — Firestore rules

Replace the whole `institutions/{institutionId}/audit_log/{eventId}` block (a **replacement**, not a diff, so none of the #66 constraints are dropped):

```text
match /institutions/{institutionId}/audit_log/{eventId} {
  allow read: if isSuperAdmin()
    || (isAdmin() && myInstitutionId() == institutionId)
    || (isTeacher() && myInstitutionId() == institutionId
        && resource.data.performedBy == request.auth.uid);
  allow create: if (isSuperAdmin()
        || ((isAdmin() || isTeacher()) && myInstitutionId() == institutionId))
    && request.resource.data.institutionId == institutionId
    && request.resource.data.keys().hasOnly([ /* unchanged key list */ ])
    && request.resource.data.keys().hasAll([ /* unchanged key list */ ])
    && request.resource.data.performedBy == request.auth.uid
    && request.resource.data.recordedAt == request.time
    && request.resource.data.eventType in [
         'role_change','password_reset','account_created','account_suspended',
         'account_reactivated','account_deleted','permission_change',
         'registration_status_change','photo_change','profile_edit'
       ]
    && request.resource.data.detail is string
    && request.resource.data.detail.size() <= 300;
  allow update, delete: if false;
}
```

Notes:

- The grouping `(isSuperAdmin() || (( … ) && myInstitutionId() == …)) && …` keeps **every** condition applying to **every** role. (An earlier draft appended `|| (isTeacher() && …)` before the `&&` chain; `&&` binds tighter than `||`, so the admin branch would have skipped all the checks.)
- **A teacher's list query must include `where('performedBy', '==', uid)`** or the rules reject it; rules filter by resource, they do not trim results.
- Teachers hold no UI for this yet. The grant exists so a future teacher flow (grade or attendance edits) needs no rules change (§13).
- No change to the `collectionGroup("audit_log")` block (super_admin-only) and none to the `users` update rule (the `status` and `canGenerateSchedule` writes already fall under its admin clause).

**Index** (`firestore.indexes.json`, collection scope, for the §9 query): `audit_log` — `performedBy` ASCENDING, `timestamp` DESCENDING (plus the implicit `__name__`). The existing collection-group composites don't serve it.

**Rollout order:** rules first (additive: adds `profile_edit` and teacher branches; nothing the current app sends is newly denied) and the index, then the app. This differs from #66's indexes → app → rules because here the app sends an event type the old rules reject.

---

## 9. Part D — "Actions I performed" in the profile Activity section (institution_admin only)

Add a second source to **Activity** in `profile/index.tsx`, gated to `role === 'institution_admin'` with a real institution (`!== '*'`):

```ts
const performed = useQuery({
  queryKey: ['auditPerformed', institutionId, user?.uid],
  enabled: DATA_MODE === 'live' && role === 'institution_admin' && !!institutionId && institutionId !== '*' && !!user?.uid,
  staleTime: 5 * 60_000,
  queryFn: async () =>
    (await getDocs(query(
      institutionCollection(institutionId!, 'audit_log'),
      where('performedBy', '==', user!.uid),
      orderBy('timestamp', 'desc'),
      limit(20),
    ))).docs.map((d) => d.data() as AuditLogEntry),
});
```

- **Merging:** `ActivityLogEntry` and `AuditLogEntry` differ structurally. Keep two typed arrays and interleave them for display by `timestamp` (an ISO string on both, so a plain string compare orders them; do not mix in `recordedAt`, which legacy entries lack). Each audit-sourced card shows `detail` plus a "→ {targetName}" tag.
- **Free tier:** at most 20 reads per admin profile visit on a cache miss, none on a hit, no listener; nothing for other roles. Each new log is one extra write per action (the profile-edit entry rides in the same batch, so it adds one write, no round trip).
- **Legacy entries** (written before `recordedAt` existed) display normally — the feed orders and renders by `timestamp` — and keep their unverified marker wherever the admin audit page already shows one.
- Teachers do **not** get this section yet (no writers); students and parents never will.

---

## 10. Security Considerations

- **`performedBy` and `recordedAt` are rules-enforced** (shipped in #66). Entries are still client-written, so a compromised admin session can write misleading `detail` text; the tamper-proof alternative remains `ISSUES_AND_GAPS.md` #23 (needs Cloud Functions).
- **Teacher reads are owner-scoped** (§8) so extending the grant never exposes admin security events. The privacy-sensitive detail is therefore enforced by the rule, not by the UI query.
- **Entries are permanent** (`allow update, delete: if false`). `profile_edit` records only field **names**, never values; even so, "Updated date of birth for …" persists forever with no deletion path. Same retention posture as `photo_change`; worth the admin knowing before it ships.
- **Deactivation takes effect immediately** (§3); nothing here relies on the old "next sign-in" limitation.
- **Batching tradeoff** (§7.1): a malformed audit entry fails the save. The shared `buildAuditEntry()` (key set, `recordedAt`, 300-char clamp) exists to make that unreachable.

---

## 11. Implementation Order

1. `firebase.ts` — add `'profile_edit'` to `AuditEventType`; tidy the stale `'suspended'` in `UserDocument.status` (§3 housekeeping; optional here).
2. `src/lib/auditLog.ts` + `src/lib/profileEditDiff.ts` with unit tests.
3. **Deploy:** `firestore.rules` (§8) and the new index, together, then confirm the index is built.
4. Migrate the existing writers (`registrationAudit.ts`, the three `photo_change` sites, `AccountStatusToggle.tsx`) to the helper — no behaviour change; re-run spec 11 and the registration-conversion flow.
5. New writers (§7): each is independently shippable — `account_created`, `profile_edit` (Student, Teacher, Parent), `password_reset`, `permission_change`.
6. Part D feed (§9), last: read-only and only meaningful once entries exist.
7. Update `e2e/11-users-lockdown.spec.ts` (§12), and `ISSUES_AND_GAPS.md` #11.

---

## 12. Testing Considerations

- Standing gate: `npx tsc -b`, `npx eslint .`, `npx vitest run`, `npm run build`.
- **Unit:** `diffChangedFields` — no change → empty; one field; several; `undefined`/`null`/`""` treated as equal; whitespace trimmed; Timestamp vs Date vs millis; a field missing from `before` counts as changed only when `after` has a value. `buildAuditEntry` — has exactly the rules' key set including `recordedAt`, and clamps `detail` to 300.
- **Per-form `data` shape:** for each of the three forms, assert that submitting an unchanged form produces **no** `profile_edit` entry (guards against fields missing from the row prop).
- **Rules probes** (extend `e2e/11-users-lockdown.spec.ts`): change the "a teacher writing an audit entry" assertion from denied to **allowed** when `performedBy` is the teacher's own uid, and keep it **denied** for another's `performedBy`; add `profile_edit` to the "every audit event type the app writes" control; assert a teacher can read an entry they wrote and **cannot** read an admin's; assert a teacher's unfiltered list query is denied.
- **End-to-end, one per writer:** create a student, edit a parent's phone, reset an admin's password (super_admin), toggle schedule access — each produces exactly one correctly-shaped entry under the **target's** institution, and (for batched edits) none when nothing changed.
- **Feed:** an institution_admin sees their own recent actions merged with their own Activity entries; a second visit within 5 minutes performs no read; other roles fire no query.
- **Regression:** `admin/audit-log/index.tsx` and "Audit and security events" are unchanged; registration conversion and the deactivate/reactivate flow still write one entry each.

---

## 13. Explicitly Out of Scope / Deferred

- **`role_change`** — blocked by `roleNotChanged()` and the cascading-reference risk (class and teacher assignments, `subjects.teacherIds`). Own future spec.
- **`account_deleted`** — needs the Admin SDK / Cloud Functions / Blaze plan, parked with institution deletion. No Firestore-only soft delete: it would misrepresent a still-working account as deleted.
- **Teacher writers and a teacher feed** — the rules grant (§8) lands now; the first real teacher flow (e.g. grade or attendance edits) and a "my actions" view for teachers are separate work.
- **Logging for `super_admin` targets** — no valid per-institution path; revisit if a platform-level audit location is added.
- **Tamper-proof logging** — client-written entries remain forgeable by a compromised session (`ISSUES_AND_GAPS.md` #23).
- **Old/new value history** — deliberately not recorded (§4, §10).
- **`student`/`parent` as `performedBy`** — they have no account-management capability, so there is nothing to log.
