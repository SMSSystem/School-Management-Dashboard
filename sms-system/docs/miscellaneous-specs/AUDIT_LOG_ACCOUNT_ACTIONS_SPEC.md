# Cross-Account Audit Logging — Feature Spec

> **Status:** Planned — not yet implemented (spec written before code, per this repo's standing convention)
> **Feature:** Closes the gap between what `AuditLogEntry` (`src/lib/firebase.ts`) was already designed to record and what actually gets written today. Adds real logging for account creation, profile-field edits, password resets, and schedule-access permission changes; builds a genuinely new account-suspension mechanism (UI + enforcement, neither of which exist today); extends `audit_log` write/read access from admin-only to `isTeacherOrAbove()`; and surfaces "actions this account performed on someone else's data" in the account's own personal Activity Log.
> **Route:** No new routes. Existing routes affected: `/dashboard/profile` (Activity section), `/dashboard/list/students`, `/dashboard/list/teachers`, `/dashboard/list/parents` (new per-row suspend action), `/dashboard/super-admin/manage-admins` (existing reset-password cell gains logging).
> **Primary roles:** Writing audit entries — `institution_admin`, `super_admin`, and (new, per this spec) `senior_teacher`/`regular_teacher`. Reading your own entries — the same four roles, each scoped to their own actions. Suspending an account — `institution_admin`/`super_admin` only, matching every other account-management action in this app.
> **Resolves:** A gap identified during a Custom Calendar / BigCalendar follow-up conversation — prompted by two concrete examples: "an `inst_admin` account created a `student`-role account" and "an `inst_admin` account updated the phone number for a `parent`-role account," neither of which leaves any trace anywhere today.

---

## 1. Overview

`AuditLogEntry` (`firebase.ts:372-381`) already has the exact shape this idea needs — `targetUid`/`targetName` (whose data changed) alongside `performedBy`/`performedByName` (who changed it) — and its Firestore rules (`firestore.rules:856-865`) are already deployed. The `audit_log` collection itself, and a dedicated admin-only viewer for it (`admin/audit-log/index.tsx`), have existed since the Photo Upload feature shipped. **The infrastructure was never the gap — almost nothing writes to it.**

Of the 8 declared `AuditEventType` values, only 2 have a real, live call site anywhere in `src/`: `photo_change` and `registration_status_change`. The other 6 — including `account_created`, the very first example that prompted this spec — are declared and never written. This spec closes that gap for the 5 of those 6 that are actually buildable with this app's current architecture, and explicitly defers the 6th (`role_change`) along with a related, previously-undiscovered blocker (`account_deleted`) to their own future specs, per your decisions below.

---

## 2. Background / Investigation Findings

Everything below was confirmed by direct file reads, not assumed.

- **Every real `audit_log` write, found via `grep -rn "eventType:\s*[\"']" src/`:** `AuthContext.tsx` (`sign_in`, to the _personal_ `activity_log` subcollection, not `audit_log`), `profile/index.tsx` (`profile_update`/`sign_in`, also personal), `registrationAudit.ts` (`registration_status_change`), `AdminCreateUserForm.tsx`/`StudentForm.tsx`/`TeacherForm.tsx` (`photo_change`, all three). That's the complete list — `account_created`, `role_change`, `password_reset`, `account_suspended`, `account_deleted`, `permission_change` have zero real writers.
- **`StudentForm.tsx`'s update handler is the clearest example of the gap.** Its `batch.update(doc(db, "users", uid), {...})` (`StudentForm.tsx:187-203`) writes `firstName`, `lastName`, `email`, `phone`, `phone2`, `idNumber`, `institutionStudentId`, `dateOfBirth`, `gender`, `classId`, `houseId` — eleven fields, zero logging. A few lines later, the _photo_ branch (`StudentForm.tsx:233-257`) is fully logged, both to the target's own `activity_log` ("Photo updated by administrator") and to the institution's `audit_log`. `TeacherForm.tsx` has the identical split (`TeacherForm.tsx:187-221` unlogged, `:240-266` photo-only logged). **`ParentForm.tsx` has no logging at all, not even for photos** — confirmed via `grep`, zero matches for `audit_log`/`activity_log` in that file.
- **`AdminCreateUserForm.tsx` never logs the creation itself** — only a photo attached at creation time (`AdminCreateUserForm.tsx:648-670`, the "CORRECTED (PR self-review)" block). The account-creation `batch.set()` a few lines earlier has no accompanying audit write.
- **The real, live password-reset trigger is `manage-admins/index.tsx`'s `ResetCell`** (`manage-admins/index.tsx:31-58`). At the time of this investigation, `AccountActionsCard.tsx` was a second, competing password-reset component — confirmed via `grep` across the whole repo to be defined, documented in two other specs, and **never imported or rendered anywhere**. It has since been deleted as dead code (a separate, small cleanup on this same branch) — mentioned here only as historical context for why `ResetCell` was identified as the one real call site, not because there are two paths to reconcile. `ResetCell` only receives `email` as a prop today; the enclosing row already has `id`/`name`/`institutionId` (the `Admin` type, `manage-admins/index.tsx:11-21`) available to thread through.
- **`schedule/index.tsx`'s "Delegate Schedule Access" toggle** (`handleToggle`, `schedule/index.tsx:78-93`) flips `canGenerateSchedule` on a senior_teacher's own `users/{uid}` document — a real permission change, with local UI feedback (`granted`/`revoked`/`error` state) but no audit trail.
- **`UserDocument.status` (`'active' | 'inactive' | 'suspended'`) is read into `AuthContext`'s `userStatus` but never enforced anywhere.** Confirmed by reading the entirety of `AuthContext.tsx` and `Protected.tsx`: `fetchRole`/`refreshProfile` set `userStatus` from the document and pass it through context; nothing ever compares it to `'suspended'` or signs the user out because of it. **No UI writes this field to `'suspended'` either** — there is no suspend action anywhere in the app today. This means `account_suspended` needs two new things built, not one: a way to set it, and a reason for it to matter.
- **`role_change` is blocked at the Firestore rules layer, not just missing a UI.** `users/{uid}`'s update rule (`firestore.rules:213-215`) requires `roleNotChanged()` for both the owner-edit and admin-edit branches — a role change is rejected by the deployed rules today, full stop. Enabling it would also mean reconciling every role-specific reference a user document can carry (`classId` for students, `assignedClassId`/`department` for senior_teachers, `subjects/{id}.teacherIds` arrays, etc.) — a cascading-risk feature in its own right.
- **`account_deleted` cannot delete another user's Firebase Auth account with this app's current architecture.** The client Auth SDK's `deleteUser()` only operates on the _currently signed-in_ user — there is no client-side way to delete an arbitrary other account. Confirmed independently by `FormModal.tsx`'s own type system: `type DeletableTableName = Exclude<TableName, "teacher" | "student" | "parent">` (`FormModal.tsx:106`) — user accounts are excluded from the generic delete mechanism at the TypeScript level, not by omission. Real deletion needs the Admin SDK, which needs a `functions/` directory and leaving the Spark billing plan — the exact same parked decision already blocking institution deletion elsewhere in this project's tracked issues.
- **`isTeacherOrAbove()` already exists** (`firestore.rules:42-44`: `isAdminOrAbove() || isTeacher()`) — extending `audit_log` create/read to teachers is a one-function swap, not new rules logic.
- **`profile/index.tsx` has two separate, already-existing sections that are easy to conflate:** "Activity" (`profile/index.tsx:665-695`, personal, self-actions only — `activity_log` subcollection, available to every role) and "Audit and security events" (`profile/index.tsx:699-745`, admin-only, already queries `audit_log` — but unfiltered by `performedBy`, showing the institution's last 5 admin actions from _anyone_, with a link to the full `admin/audit-log/index.tsx` page). Per your decision, this spec's new feed merges into **Activity**, and leaves **Audit and security events** completely untouched — it's already doing its own, different job correctly.
- **`registrationAudit.ts`'s `logRegistrationAudit()`** is already a narrow, one-event-type version of the helper this spec generalizes — a real precedent to build on, not a new pattern.

---

## 3. Design Decisions

| Decision                          | Choice                                                                                                                                                                                                                      | Rationale                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event coverage                    | `account_created`, `permission_change`, `password_reset`, and general field edits (not just photo) on Student/Teacher/Parent forms                                                                                          | Your explicit choice — covers every admin-editable field, not just the two examples originally given.                                                                                                                                                                                                         |
| Role scope                        | Extend `audit_log` create + read to `senior_teacher`/`regular_teacher` via `isTeacherOrAbove()`                                                                                                                             | Your explicit choice — teachers already edit student data (attendance, grades) today with nothing logged; `isTeacherOrAbove()` already exists, so this is a one-line rules change.                                                                                                                            |
| Where it's shown                  | Merge into `profile/index.tsx`'s existing **Activity** section (`performedBy`-filtered `audit_log` query)                                                                                                                   | Matches your literal phrasing and keeps the already-correct admin-only "Audit and security events" section untouched.                                                                                                                                                                                         |
| Field-edit detail message         | Diff the submitted values against the form's own pre-edit `data` prop and list which fields actually changed (e.g. "Updated phone, class for Jane Doe") rather than a generic "Updated profile for Jane Doe"                | Directly serves your own example ("updated the phone number") — a generic message would tell the account owner _that_ something changed but not _what_, which is the whole point of an audit trail. The pre-edit values are already in memory (`data` prop, used for `defaultValue`s) — no extra read needed. |
| `account_suspended`               | Build both a new toggle action (per-row, in the Actions column of `list/students`/`list/teachers`/`list/parents`, mirroring `ResetCell`'s existing inline-icon pattern) **and** a new enforcement gate in `AuthContext.tsx` | Your explicit choice ("include the missing flows"). Setting `status: 'suspended'` with no enforcement would be actively misleading — the account would keep working exactly as before.                                                                                                                        |
| `role_change`                     | **Deferred** — written up as its own future spec, not designed here                                                                                                                                                         | Your explicit choice, given the rules-level block and the cascading-reference risk discovered during investigation.                                                                                                                                                                                           |
| `account_deleted`                 | **Deferred**, matching the already-parked institution-deletion decision                                                                                                                                                     | Your explicit choice — no Firestore-only "soft delete" that leaves the Auth account (and sign-in ability) fully intact, since that would misrepresent what happened.                                                                                                                                          |
| Shared logging helper             | New `src/lib/auditLog.ts` exporting a generic `logAuditEvent()`, with `registrationAudit.ts`'s `logRegistrationAudit()` refactored to call it                                                                               | Five-plus call sites duplicating the same `addDoc` shape is exactly the kind of drift `registrationAudit.ts` already avoided for one event type — generalizing it once is cheaper than five more copies.                                                                                                      |
| `audit_log` create-rule hardening | Add `request.resource.data.performedBy == request.auth.uid` to the existing create rule                                                                                                                                     | Not currently checked — a write could claim any `performedBy` today. More relevant now that write access extends to the lower-trust teacher role, not just admins.                                                                                                                                            |

---

## 4. Data Model

**No schema changes.** Every field this spec needs already exists:

- `AuditLogEntry` / `AuditEventType` (`firebase.ts:362-381`) — unchanged. This spec only adds _writers_ for `account_created`, `password_reset`, `permission_change`, and a new `profile_edit` value (see below), plus a genuinely new `account_suspended` writer.
- `UserDocument.status` (`firebase.ts`, already `'active' | 'inactive' | 'suspended'`) — unchanged; this spec adds the first real writer and reader of it.

**One addition to `AuditEventType`:** a new `'profile_edit'` member, for the generalized Student/Teacher/Parent field-change case — distinct from `photo_change` (which stays as-is, unchanged, still its own event type) since the two need different `detail` message shapes (a photo has no meaningful "diff," a field edit does).

```diff
 export type AuditEventType =
   | 'role_change'
   | 'password_reset'
   | 'account_created'
   | 'account_suspended'
   | 'account_deleted'
   | 'permission_change'
   | 'registration_status_change'
-  | 'photo_change';
+  | 'photo_change'
+  | 'profile_edit';
```

---

## 5. Part A — Shared logging helper

New file, `src/lib/auditLog.ts`:

```ts
import { addDoc } from "firebase/firestore";
import { institutionCollection } from "@/lib/paths";
import type { AuditEventType } from "@/lib/firebase";

export async function logAuditEvent(params: {
  institutionId: string;
  eventType: AuditEventType;
  detail: string;
  targetUid: string;
  targetName: string;
  performedBy: string;
  performedByName: string;
}) {
  await addDoc(institutionCollection(params.institutionId, "audit_log"), {
    eventType: params.eventType,
    detail: params.detail,
    targetUid: params.targetUid,
    targetName: params.targetName,
    performedBy: params.performedBy,
    performedByName: params.performedByName,
    timestamp: new Date().toISOString(),
    institutionId: params.institutionId,
  });
}
```

`registrationAudit.ts`'s `logRegistrationAudit()` becomes a thin wrapper delegating to this (same public signature for its one existing caller, `ConvertToAccountsPanel.tsx`, so that call site doesn't change):

```diff
 export async function logRegistrationAudit(
   institutionId: string,
   registrationId: string,
   studentName: string,
   detail: string,
   performedBy: string,
   performedByName: string,
 ) {
-  await addDoc(institutionCollection(institutionId, "audit_log"), {
-    eventType: "registration_status_change",
-    detail,
-    targetUid: registrationId,
-    targetName: studentName,
-    performedBy,
-    performedByName,
-    timestamp: new Date().toISOString(),
-    institutionId,
-  });
+  await logAuditEvent({
+    institutionId,
+    eventType: "registration_status_change",
+    detail,
+    targetUid: registrationId,
+    targetName: studentName,
+    performedBy,
+    performedByName,
+  });
 }
```

Every write site below (Parts B and C) calls `logAuditEvent()` directly instead of inlining its own `addDoc`, including the three existing `photo_change` call sites (`AdminCreateUserForm.tsx`, `StudentForm.tsx`, `TeacherForm.tsx`) — migrated to the shared helper in the same pass rather than left as a fourth inconsistent copy.

---

## 6. Part B — New writers for existing, reachable actions

All four of these are "add a `logAuditEvent()` call after an action that already exists" — no new UI, no new enforcement, no rules change beyond §8.

### 6.1 `account_created` — `AdminCreateUserForm.tsx`

After the existing `batch.commit()` (`AdminCreateUserForm.tsx:624`), alongside the existing best-effort photo-audit block:

```ts
try {
  await logAuditEvent({
    institutionId: values.role === "super_admin" ? "*" : values.institutionId,
    eventType: "account_created",
    detail: `Created ${getRoleLabel(values.role)} account for ${createdName}`,
    targetUid: createdUser.uid,
    targetName: createdName,
    performedBy: user.uid,
    performedByName: displayName ?? user.email ?? "Administrator",
  });
} catch {
  // Best-effort — the account itself already exists regardless.
}
```

Fires for every role this form creates, including `institution_admin`/`super_admin` (their own password fields stay free-typed per the earlier `AdminCreateUserForm` change, but _creating_ them is still worth logging). A `super_admin`-role creation logs against the `"*"` sentinel institution — matches how `institutionId` is already computed a few lines above for the Firestore profile write itself, so no new branching.

### 6.2 `profile_edit` — `StudentForm.tsx` / `TeacherForm.tsx` / `ParentForm.tsx`

A shared diff helper, `src/lib/profileEditDiff.ts`:

```ts
const FIELD_LABELS: Record<string, string> = {
  firstName: "first name",
  lastName: "last name",
  email: "email",
  phone: "phone",
  phone2: "second phone",
  idNumber: "ID number",
  address: "address",
  dateOfBirth: "date of birth",
  gender: "gender",
  classId: "class",
  houseId: "house",
  departmentId: "department",
  assignedClassId: "homeroom class",
  homeroomRoom: "homeroom room",
  homeroomBuilding: "homeroom building",
  institutionStudentId: "student ID",
};

export function diffChangedFields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  fields: string[],
): string[] {
  return fields
    .filter((f) => (before?.[f] ?? null) !== (after[f] ?? null))
    .map((f) => FIELD_LABELS[f] ?? f);
}
```

`StudentForm.tsx`'s `onSubmit`, right after the existing `batch.commit()` (`:228`):

```ts
const changedFields = diffChangedFields(data, formData, [
  "firstName",
  "lastName",
  "email",
  "phone",
  "phone2",
  "idNumber",
  "institutionStudentId",
  "dateOfBirth",
  "gender",
  "classId",
  "houseId",
]);
if (changedFields.length > 0) {
  try {
    await logAuditEvent({
      institutionId,
      eventType: "profile_edit",
      detail: `Updated ${changedFields.join(", ")} for ${formData.firstName} ${formData.lastName}`,
      targetUid: uid,
      targetName: `${formData.firstName} ${formData.lastName}`,
      performedBy: user.uid,
      performedByName: displayName ?? user.email ?? "Administrator",
    });
  } catch {
    // Best-effort — the profile update itself already succeeded above.
  }
}
```

`TeacherForm.tsx` follows the identical shape with its own field list (`assignedClassId`, `homeroomRoom`, `homeroomBuilding`, `departmentId` in place of the student-only fields). `ParentForm.tsx` gains this same pattern from scratch (it currently has none) — `phone`/`address` are the two fields `ParentDocument` (`firebase.ts:195-199`) actually carries, so its field list is short.

The existing photo-branch logging in `StudentForm.tsx`/`TeacherForm.tsx` stays a **separate** `logAuditEvent()` call with `eventType: "photo_change"` — not folded into the `profile_edit` diff, since a photo isn't a "field" in the same sense and already has its own working message format.

### 6.3 `password_reset` — `manage-admins/index.tsx`

`ResetCell`'s props expand from `{ email }` to `{ id, name, email, institutionId }` (all already available on the `Admin` row this component renders inside):

```diff
-function ResetCell({ email }: { email: string }) {
+function ResetCell({ id, name, email, institutionId }: { id: string; name: string; email: string; institutionId: string }) {
+  const { user, displayName } = useAuth();
   const [sent, setSent] = useState(false);
   const [loading, setLoading] = useState(false);

   const handleReset = async () => {
     setLoading(true);
     try {
       await sendPasswordResetEmail(getAuth(), email);
+      if (user) {
+        await logAuditEvent({
+          institutionId,
+          eventType: "password_reset",
+          detail: `Sent password reset email to ${name}`,
+          targetUid: id,
+          targetName: name,
+          performedBy: user.uid,
+          performedByName: displayName ?? user.email ?? "Administrator",
+        }).catch(() => {});
+      }
       setSent(true);
     } finally {
       setLoading(false);
     }
   };
```

`AccountActionsCard.tsx` is **not** touched by this spec — it's dead code (never imported anywhere), so there's no reachable call site to add logging to. Worth a separate, small housekeeping decision (delete it, or finally wire it up somewhere) — flagged here, not resolved by this spec.

### 6.4 `permission_change` — `schedule/index.tsx`

`handleToggle` (`schedule/index.tsx:78-93`), after the existing `updateDoc`:

```diff
 async function handleToggle(teacher: SeniorTeacher) {
   const next = !teacher.canGenerateSchedule;
   try {
     await updateDoc(doc(db, 'users', teacher.id), { canGenerateSchedule: next });
     setSeniorTeachers(prev =>
       prev.map(t => t.id === teacher.id ? { ...t, canGenerateSchedule: next } : t)
     );
     setFeedback(prev => ({ ...prev, [teacher.id]: next ? 'granted' : 'revoked' }));
+    if (user && institutionId) {
+      await logAuditEvent({
+        institutionId,
+        eventType: "permission_change",
+        detail: `${next ? 'Granted' : 'Revoked'} schedule-generation access for ${teacher.name}`,
+        targetUid: teacher.id,
+        targetName: teacher.name,
+        performedBy: user.uid,
+        performedByName: displayName ?? user.email ?? "Administrator",
+      }).catch(() => {});
+    }
   } catch {
     setFeedback(prev => ({ ...prev, [teacher.id]: 'error' }));
   }
```

---

## 7. Part C — `account_suspended` (genuinely new: UI + enforcement)

### 7.1 New UI — per-row suspend toggle

New small component, `SuspendCell` (`src/components/SuspendCell.tsx`), mirroring `ResetCell`'s existing inline-icon pattern exactly:

```tsx
export function SuspendCell({
  uid,
  name,
  status,
  institutionId,
}: {
  uid: string;
  name: string;
  status: string | undefined;
  institutionId: string;
}) {
  const { user, displayName } = useAuth();
  const [loading, setLoading] = useState(false);
  const isSuspended = status === "suspended";

  const handleToggle = async () => {
    setLoading(true);
    try {
      const next = isSuspended ? "active" : "suspended";
      await updateDoc(doc(db, "users", uid), { status: next });
      await logAuditEvent({
        institutionId,
        eventType: "account_suspended",
        detail: `${next === "suspended" ? "Suspended" : "Reactivated"} ${name}'s account`,
        targetUid: uid,
        targetName: name,
        performedBy: user!.uid,
        performedByName: displayName ?? user!.email ?? "Administrator",
      }).catch(() => {});
    } finally {
      setLoading(false);
    }
  };
  // ...icon button, same gray/amber styling family as ResetCell, aria-label
  // toggles between "Suspend account" / "Reactivate account"
}
```

Rendered in the Actions column of `list/students/index.tsx`, `list/teachers/index.tsx`, `list/parents/index.tsx` — same `(role === "institution_admin" || role === "super_admin")` gate the existing edit `FormModal` already uses at each of those three call sites (e.g. `list/students/index.tsx:196-199`).

**Note on the event type name**: `account_suspended` is kept as the single event type for both directions (suspend and reactivate) rather than adding a ninth `account_reactivated` type — the `detail` string already distinguishes them, matching how `photo_change` already covers both "updated" and "removed" via its `detail` text rather than separate event types.

### 7.2 New enforcement — `AuthContext.tsx`

`fetchRole()` (`AuthContext.tsx:106-195`), right after the existing "no role → sign out" guard:

```diff
       if (!fetchedRole) {
         await firebaseSignOut(auth);
         return;
       }

+      if ((data?.status as string) === 'suspended') {
+        await firebaseSignOut(auth);
+        return;
+      }
+
       setRole(fetchedRole);
```

This mirrors the existing pattern exactly (same file, same function, same "can't safely proceed, sign back out" shape already used two lines above). A suspended account is signed out **on their next sign-in attempt** — this does not forcibly terminate an already-open session elsewhere (no server-side session revocation exists in this app; the same limitation already applies to every other `AuthContext` state change). Worth stating explicitly rather than implying real-time termination.

No change needed to `Protected.tsx` — `AuthContext` never sets `user` for a suspended account in the first place, so `Protected`'s existing `!user → /login` branch already covers the resulting state correctly.

---

## 8. Part D — Firestore Rules

Two changes to the existing `institutions/{institutionId}/audit_log/{eventId}` match block (`firestore.rules:856-865`):

```diff
     match /institutions/{institutionId}/audit_log/{eventId} {
       allow read: if isSuperAdmin()
-        || (isAdmin() && myInstitutionId() == institutionId);
+        || (isTeacherOrAbove() && myInstitutionId() == institutionId);
       allow create: if (isSuperAdmin() || (isAdmin() && myInstitutionId() == institutionId))
+          || (isTeacher() && myInstitutionId() == institutionId)
         && request.resource.data.institutionId == institutionId
+        && request.resource.data.performedBy == request.auth.uid
         && request.resource.data.keys().hasAll([
              'eventType','detail','targetUid','targetName',
              'performedBy','performedByName','timestamp','institutionId'
            ]);
       allow update, delete: if false;
     }
```

**Read**: swapped `isAdmin()` for `isTeacherOrAbove()` (already `isAdminOrAbove() || isTeacher()`), so a `senior_teacher`/`regular_teacher` can now read their own institution's `audit_log` — needed for §9's `performedBy`-filtered query to work at all for them.

**Create**: added a parallel `isTeacher()` branch (kept separate from the existing admin branch rather than folded into one `isTeacherOrAbove()` call, since the existing admin branch already has its own parenthesization this diff shouldn't disturb) — a `senior_teacher`/`regular_teacher` can now write their own `audit_log` entries, e.g. when editing a student's data directly (outside this spec's Part B/C scope, but the same rule now makes it possible for future work). Added `performedBy == request.auth.uid`, closing a pre-existing gap where any writer could claim any `performedBy` — more relevant now that a lower-trust role can write at all.

**No change** to the `collectionGroup("audit_log")` match block (`firestore.rules:1333-1335`, super_admin-only) — unrelated to this spec's per-institution, per-account use case.

**No change** to `users/{uid}`'s existing update rule for `status` — writing `status: 'suspended'`/`'active'` already falls under its existing broad `isAdminOrAbove() && sameInstitution(...) && institutionNotChanged() && roleNotChanged()` clause (`firestore.rules:213-215`), same as every other field an admin edits on another account's document today.

---

## 9. Part E — Personal Activity Log (the actual user-facing surface)

`profile/index.tsx`'s existing **Activity** section (`:665-695`) currently renders only `liveActivity` (the signed-in account's own `users/{uid}/activity_log` subcollection, `:184-194`). Add a second, parallel fetch:

```ts
const [performedActions, setPerformedActions] = useState<AuditLogEntry[]>([]);
useEffect(() => {
  if (
    DATA_MODE !== "live" ||
    !user?.uid ||
    !institutionId ||
    institutionId === "*"
  )
    return;
  getDocs(
    query(
      institutionCollection(institutionId, "audit_log"),
      where("performedBy", "==", user.uid),
      orderBy("timestamp", "desc"),
      limit(20),
    ),
  )
    .then((snap) => {
      setPerformedActions(snap.docs.map((d) => d.data() as AuditLogEntry));
    })
    .catch(() => {
      // non-critical — same degrade posture as the existing liveActivity fetch
    });
}, [user?.uid, institutionId, retryCount]);
```

Gated the same way §8's rules now allow: any role except `super_admin`/`student`/`parent` can have entries here (`super_admin`'s `institutionId` is the `'*'` sentinel, so the `institutionId === '*'` guard above already skips them the same way the existing "Audit and security events" section does; `student`/`parent` can never be `performedBy` on anything this spec writes, so an empty result for them is simply correct, not a gap).

**Merging into one feed**: `ActivityLogEntry` and `AuditLogEntry` are structurally different (`uid` vs `targetUid`/`performedBy`, no `detail`-only rendering assumption). Rather than force them into one array, the existing Activity section's render (`:671-693`) gets a second `.map()` block immediately below the first, sharing the same `Section` wrapper and card styling, sorted together by interleaving both arrays on `timestamp` before rendering (a small client-side merge-sort, not a second Firestore composite query) — visually one continuous "Activity" list, structurally two typed arrays underneath. Each `audit_log`-sourced card renders `item.detail` directly (already human-readable, e.g. "Updated phone, class for Jane Doe") with a small "→ {targetName}" annotation distinguishing it from a self-action card at a glance.

---

## 10. Security Considerations

- **`performedBy` spoofing**, addressed by §8's new create-rule check — was possible before this spec for admin writers too, not a new risk this spec introduces, but newly worth closing given write access now extends to teachers.
- **A suspended account's already-open sessions aren't revoked in real time** (§7.2) — stated explicitly there, not glossed over. This app has no server-side session/token revocation mechanism (no Cloud Functions, no custom claims refresh trigger), so "suspend" here means "cannot sign in again," not "immediately logged out everywhere." Acceptable given the alternative (building real-time revocation) is squarely in the same missing-Admin-SDK-infrastructure category as `account_deleted` — flagged, not silently assumed.
- **`audit_log` entries are permanent** (`allow update, delete: if false`, unchanged) — a `profile_edit` entry naming exactly which fields changed is itself a small amount of PII-adjacent metadata (e.g. "Updated date of birth for...") that now persists forever with no deletion path. Same retention posture this collection already had for `photo_change`/`registration_status_change`; not a new category of concern, but worth the acting admin knowing before this ships, same as the shared-password tradeoff in `SPREADSHEET_IMPORT_STUDENTS_SPEC.md` was written down rather than left implicit.

---

## 11. Implementation Order

1. `firebase.ts` — add `'profile_edit'` to `AuditEventType`.
2. `src/lib/auditLog.ts` — new shared `logAuditEvent()` helper.
3. `registrationAudit.ts` — refactor to delegate to it (no behavior change, confirm via existing registration-conversion flow still working).
4. `firestore.rules` (§8) — deploy the `audit_log` read/create changes before shipping any code that depends on them, same "rules before dependent UI" ordering this project always uses.
5. Part B writers (§6): `AdminCreateUserForm.tsx` (`account_created`), `StudentForm.tsx`/`TeacherForm.tsx`/`ParentForm.tsx` (`profile_edit`, including migrating their existing `photo_change` calls to the shared helper), `manage-admins/index.tsx` (`password_reset`), `schedule/index.tsx` (`permission_change`). Independently shippable and testable one at a time.
6. Part C (§7): `SuspendCell.tsx` + wiring into the three list pages, then the `AuthContext.tsx` enforcement gate — build the UI first, verify the Firestore write, _then_ add enforcement (matches this project's own precedent of verifying a gate mechanism independently before the feature that depends on it, per `SPREADSHEET_IMPORT_STUDENTS_SPEC.md`'s own implementation order for `mustChangePassword`).
7. Part E (§9): the `profile/index.tsx` merged Activity feed — last, since it's read-only and depends on entries actually existing from steps 5-6 to be meaningfully testable.

---

## 12. Testing Considerations

- `npx tsc -b` / `npx eslint` / `npx vitest run` / `npm run build` — standing gate.
- `diffChangedFields()` (§6.2) is pure and unit-testable — cover "no change → empty array," "one field changed," "multiple fields changed," and "field changed from a value back to its original value within the same edit session isn't double-counted" (not applicable here since it only ever compares two snapshots, but worth a test making that explicit).
- Manual/e2e per new writer (§6): create a student, edit a parent's phone number, reset an admin's password, toggle schedule access, suspend then reactivate a teacher — confirm each produces exactly one correctly-shaped `audit_log` entry.
- Manual: confirm a `senior_teacher`/`regular_teacher` account can now read `/dashboard/profile`'s Activity section without a permission error (post-§8 rules deploy), and that a `student`/`parent` account's Activity section is unaffected (no new query fires for them).
- Manual: suspend a test account, confirm they're signed out on next login attempt with no confusing error state (should land on `/login` the same as any other auth failure, not a broken loading spinner).
- Regression: confirm `admin/audit-log/index.tsx` and `profile/index.tsx`'s existing "Audit and security events" section are pixel-for-pixel unchanged — this spec adds a new reader (`performedBy`-filtered) alongside the existing unfiltered institution-wide one, never replaces it.

---

## 13. Explicitly Out of Scope / Deferred Items

- **`role_change`** — blocked by `firestore.rules`' `roleNotChanged()` constraint and the cascading-reference risk described in §2. Track as its own future spec.
- **`account_deleted`** — blocked by the same missing Admin SDK / Cloud Functions / Spark-plan constraint already parked against institution deletion elsewhere in this project. No Firestore-only soft delete built here, since it would misrepresent an account as deleted while it can still sign in.
- **`AccountActionsCard.tsx`** — confirmed dead code (never imported). Not touched by this spec; a separate, small housekeeping decision (delete it, or wire it into a real page) is available whenever wanted.
- **Real-time session revocation for a suspended account** — same missing-infrastructure category as `account_deleted`; §7.2's "blocked on next sign-in" is the ceiling of what's buildable today.
- **Extending suspension/logging to `student`/`parent`-initiated actions** — neither role can ever be a `performedBy` under this spec (they have no account-management capability over other accounts today), so there's nothing for them to log; not a gap, just out of scope by construction.
