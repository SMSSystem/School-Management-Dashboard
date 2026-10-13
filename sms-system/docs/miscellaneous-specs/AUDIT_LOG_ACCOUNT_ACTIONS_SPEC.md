# Audit & Activity Logs — Build-out Spec (account actions, teacher actions, pagination)

> **Status:** Implemented and shipped (PR #71, 2026-10-02) and verified live. All nine steps of §13 were built and unit-tested; `firestore.rules` and the three new `audit_log` indexes are deployed, and the live specs `e2e/11-users-lockdown.spec.ts` (rule probes) and `e2e/14-audit-activity.spec.ts` have passed. **Deploy order matters** for any rebuild of this feature: rules and indexes first (the indexes must be built), then the app, because every form save commits its audit entry in the same batch and a rules rejection fails the save. Account **deactivation** (PR #66) and **session clearing** (PR #70) already wrote audit entries before this work (§3). Spec written before code, per this repo's standing convention. Not covered by a UI e2e (checked by hand): attendance Save All, gradebook save and column delete, feedback comment, result, account creation and password reset.
> **Feature:** Builds out the Audit Log and the Activity Log. Adds real logging for account creation, profile-field edits, password resets, schedule-access changes and the teacher actions that change other people's records (attendance, results/gradebook, feedback comments, lesson notes); opens `audit_log` create plus an owner-scoped read to teachers; shows every staff account the actions **it** performed on other accounts' data; paginates the Audit Log page and both profile sections; and stops the profile page stretching.
> **Route:** No new routes. Affected: `/dashboard/profile` (Activity and "Audit and security events" sections), `/dashboard/admin/audit-log`, the super-admin dashboard Alerts widget, `/dashboard/list/students|teachers|parents` (edit forms), `/dashboard/super-admin/manage-admins`, `/dashboard/schedule`, the account-creation form, `/dashboard/attendance/*`, `/dashboard/list/gradebook`, the result, feedback-comment and lesson-note forms.
> **Roles:** Writing — `institution_admin`, `super_admin` (any event); `senior_teacher`/`regular_teacher` (the four teacher events, §8). Reading — admins read their institution's log; teachers read only entries they wrote; super_admin reads all.
> **Resolves:** The two examples that prompted the original spec ("an `inst_admin` created a `student` account", "an `inst_admin` updated a `parent`'s phone number"), `ISSUES_AND_GAPS.md` **#11** (admin form actions don't write audit entries) and **#21** (no cursor pagination on `/admin/audit-log`). Both are marked resolved in `ISSUES_AND_GAPS.md`, which also has the limits in **#44**.
>
> **Built differently from this plan** (the sections below are the plan as written; these are where the code departs from it):
>
> - **Teacher form diff base (§7.1):** `TeacherForm` compares against the teacher's profile as it was loaded into the form (`getDoc`), not the list row, which does not carry every field the form edits.
> - **Lesson-note target (§7.5):** a note with no class targets the note itself (`targetUid` = note id, `targetName` = note name), because a note's class is optional.
> - **General Attendance "Save All" (§7.5):** it logs **one summary entry** after its registers, best-effort, not one entry per register in each register's batch. A single register save is still atomic with its entry.
> - **Gradebook (§7.5):** one save can write **two** entries (`results_edit` for scores and column edits, `comment_edit` for conduct grades and comments). Operations are counted, and when an entry would take the batch past Firestore's 500-operation cap it is written right after the commit instead (`fitsInBatch`). Column **deletion** is logged; column **creation** is not.
> - **Two bugs fixed on the way** (not in the plan): the Students list row did not carry `phone2` or `idNumber`, so editing a student blanked both; and unticking a linked student on the Parent form did nothing, so it now deletes the link in the same batch (and the save is disabled until the existing links have loaded).
> - **Audit Log page (§9, §10):** added a **Refresh** button that drops every cached page and returns to page 1 (a cached page is keyed by its number, not its cursor), and an institution tag on rows in the super_admin all-institutions view.
> - **Profile (§9.3, §11):** "Actions I performed" reads nothing until its tab is opened; a student or parent with no activity sees no Activity card; a super_admin's *Audit and security events* stays a link to the full log.
> - **Helpers beyond §6:** `auditEntry.ts` (the pure half of the helper, so it can be unit-tested without the Firebase app), `actorName`, `staffFallback`, `fitsInBatch`, `teacherAudit.ts` (the teacher entries' wording), `entryTime.ts` and `cursorPaging.ts` (pure paging logic). The `useCursorPages` hook and the pager/section components are thin and have **no unit tests**; `e2e/14` covers them.
> - **Tests (§13):** the e2e coverage is `e2e/11` (rule probes) plus a new `e2e/14` driving three writers (`profile_edit`, `permission_change`, `lesson_note_edit`), paging, the profile tabs and layout. The other writers (attendance, gradebook, feedback comments, results, `account_created`, `password_reset`) are covered by the wording unit tests and the rule probes, not by a UI test.

---

## 1. Overview

`AuditLogEntry` already has the shape this needs — `targetUid`/`targetName` (whose data changed) next to `performedBy`/`performedByName` (who changed it) — and the collection has a viewer (`admin/audit-log/index.tsx`). **The infrastructure was never the gap; almost nothing writes to it, and the viewers cannot page.**

Live writers today (five): `photo_change` (Student, Teacher and account-creation forms), `registration_status_change` (`registrationAudit.ts`), `account_suspended`/`account_reactivated` (`AccountStatusToggle.tsx`, #66) and `session_reset` (`SessionResetButton.tsx`, #70). `account_created`, `password_reset` and `permission_change` are declared and never written; ordinary field edits and every teacher action have no event at all.

This spec adds writers for those, five new event types (`profile_edit`, `attendance_edit`, `results_edit`, `comment_edit`, `lesson_note_edit`), the rules and indexes behind them, cursor pagination, and the read path that shows each account its own "actions performed". `role_change` and `account_deleted` stay deferred (§15).

---

## 2. Background / Investigation Findings

Confirmed against `main` at `33ec29d` (after PR #70). Line numbers drift; blocks and functions are named so they can be found again.

**Rules and types**

- **Every audit write must carry `recordedAt`.** The `institutions/{id}/audit_log/{eventId}` create rule requires `recordedAt == request.time`, `performedBy == request.auth.uid`, an exact key set (`eventType, detail, targetUid, targetName, performedBy, performedByName, timestamp, institutionId, recordedAt`), an `eventType` from an allow-list, and `detail` a string of at most 300 characters. `timestamp` stays the legacy client ISO string used for ordering and display.
- **The allow-list today is `role_change, password_reset, account_created, account_suspended, account_reactivated, account_deleted, permission_change, registration_status_change, photo_change, session_reset`.** `session_reset` was added by #70 and **must be carried into any replacement of the rules block** — an earlier draft of this spec omitted it, which would have broken the admin "Clear session" button. The TypeScript `AuditEventType` and the rules list are separate lists and must stay identical (§6.3 adds a test that enforces it).
- **Writes are admin-only and reads are admin-only** in the rules today (`isSuperAdmin()` or `isAdmin()` of that institution). `e2e/11-users-lockdown.spec.ts` ("a teacher writing an audit entry") asserts the **denial** and must change with this spec (§13).
- **Indexes:** the existing `audit_log` composites are **collection-group** indexes (`eventType`+`timestamp`, `institutionId`+`timestamp`). No index serves a `performedBy` filter at either scope.
- **`targetUid` is typed as a person's uid** but the key is required on every entry. Class-scoped teacher actions (attendance, a whole gradebook) have no single person as target — see the convention in §4.

**Existing writers / forms**

- **`StudentForm.tsx`'s update handler** builds one `writeBatch` (user update, house `studentIds` arrays, optional photo). The photo branch writes `activity_log` + `audit_log` best-effort **after** the commit. Field edits write no audit entry. `TeacherForm.tsx` is the same split (batch with the user `set(…, {merge:true})`, `subjects/{id}.teacherIds`, optional photo; best-effort photo log filed under the **target's** institution, `targetInstitutionId`). The teacher form edits first/last name, phone, department, and for senior teachers the homeroom class/room/building and subject assignments — **not email**.
- **`ParentForm.tsx`** is also a batch (`users/{uid}` `set(…, {merge:true})`, `student_parents` links) with no logging. It reads `institutionId` from `useAuth()`, which is the `'*'` sentinel for a super_admin — the target parent's institution must come from the row (`data`) instead.
- **`AdminCreateUserForm.tsx`** commits the Auth account's Firestore profile in a batch; a failed batch rolls back by deleting the Auth user. Only a creation-time photo is audited (best-effort, skipped for `super_admin` targets). The creation itself writes no entry.
- **The only live password-reset trigger is `manage-admins/index.tsx`'s `ResetCell`** (super_admin only; rows are institution admins; each `Admin` row carries `id`, `name`, `institutionId`).
- **`schedule/index.tsx`'s `handleToggle`** flips `canGenerateSchedule` on a senior teacher's user document (institution_admin only) and writes no trail.
- **Teacher write sites that change other people's records, none audited:** `attendance/general/index.tsx` and `attendance/subject/index.tsx` (a lone `setDoc` per register save); `list/gradebook/index.tsx` (a `writeBatch` per save, plus a batch that deletes a column and its results); `components/forms/ResultForm.tsx` (`addDoc`/`updateDoc`); `components/forms/FeedbackCommentForm.tsx` (`addDoc`/`updateDoc`); `components/forms/LessonNoteForm.tsx` (already a `writeBatch`). Admins can reach some of these too, so the writers log whoever saves.

**Viewers (current behaviour)**

- **`profile/index.tsx`** has two sections: "Activity" (the account's own `users/{uid}/activity_log`, `limit(20)`, fetched once in a `useEffect`, every role) and "Audit and security events" (institution_admin only, the institution's last `limit(5)` from anyone; super_admin gets only a link). Neither is cached or paged, and entries are keyed `${eventType}-${timestamp}` (collides on equal timestamps).
- **Page stretch:** `Section` carries `h-[stretch]` (`profile/index.tsx`, the `Section` component) and the lists have no height cap, so a long Activity list makes the right column tall and the left-column sections stretch to match.
- **`admin/audit-log/index.tsx`** shows 50 entries (`limit(50)`) with no way to reach older ones, renders only the legacy client `timestamp` (no verified `recordedAt`, no "unverified" marker the profile uses), prints raw `eventType` slugs, has no error state (a failed query reads as "No audit entries found"), and keys rows `eventType-timestamp-index`. Both viewers discard the Firestore snapshots (`.map(d => d.data())`), which cursor pagination needs.
- **Activity event labels:** the profile maps only `sign_in`, `photo_update` and `notification_change`; anything else (including the real `profile_update`) renders as the raw slug. `sign_out`, `password_change` and `notification_change` exist as types but **nothing writes them**. Sign-in is logged once per tab session (`SESSION_SIGNIN_KEY` in `AuthContext.tsx`).
- **`superadmin/AlertsFeed.tsx`** shows the 10 newest entries of `collectionGroup("audit_log")` as "alerts". With teacher events added, routine attendance saves would bury every real alert — it needs an event-type filter (§10).
- **`roleNotChanged()` still blocks role edits** and deleting other users' Auth accounts still needs the Admin SDK (no Cloud Functions on Spark). Both deferrals stand.
- **`registrationAudit.ts`** already writes `recordedAt: serverTimestamp()`; it is the precedent for a shared helper.

---

## 3. Shipped (formerly Part C — suspension; plus #70)

Nothing here is built by this spec; recorded so the remaining parts stay consistent with it (same event naming, same batch-with-the-change pattern).

- **Deactivation (#66):** status `'inactive'` (wording "deactivate"/"reactivate"); `AccountStatusToggle.tsx` on the students, teachers and parents lists with a confirmation dialog, shown only to `institution_admin`/`super_admin` and never on one's own row. The status change and its audit entry are written in **one `writeBatch`**, and the cached row is patched with `setQueryData`. Enforcement is server-side (`accountActive()` in `firestore.rules`) and takes effect in an open session. Events: `account_suspended` / `account_reactivated` (`lib/accountStatus.ts#statusAuditEvent`).
- **Session clearing (#70):** `SessionResetButton.tsx` on the same three lists stamps `users/{uid}.sessionResetAt` and writes a `session_reset` audit entry in **one batch**.
- **Stale leftovers (separate, small):** `UserDocument.status` in `firebase.ts` still reads `'active' | 'inactive' | 'suspended'`, and the super-admin mock types and `RecentSignups` still say `'suspended'`; `'suspended'` is not a status the app or rules recognise.

---

## 4. Design Decisions

| Decision                        | Choice                                                                                                                                                                                                                                                                                                                                                                                         | Rationale                                                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event coverage                  | Admin: `account_created`, `profile_edit`, `password_reset`, `permission_change`. Teacher: `attendance_edit`, `results_edit`, `comment_edit`, `lesson_note_edit`                                                                                                                                                                                                                                | The reachable, unlogged actions that change another account's or class's records. Deactivation and session clearing are done (§3).                                              |
| Source of "actions I performed" | Query the institution's `audit_log` where `performedBy == uid` — **no mirror writes** into the actor's `activity_log`                                                                                                                                                                                                                                                                          | One source of truth and no extra write per action. Costs one new index; a super_admin uses a collection-group query (§9.3).                                                     |
| Atomicity                       | `writeBatch` where the primary write already is a batch or can become one (Student/Teacher/Parent forms, attendance, results, gradebook, comments, lesson notes); best-effort after the fact where a batch is impossible (`account_created` after Auth creation, `password_reset` after the email send) or the action is a lone `updateDoc` that is not worth converting (`permission_change`) | Matches `AccountStatusToggle`: a change should never exist without its record. Auth- and email-driven actions can't batch, and a log failure must not roll back a real account. |
| Teacher access                  | Teachers may **create** entries — **only the four teacher event types**, own `performedBy`, same constraints — and **read only their own**                                                                                                                                                                                                                                                     | A teacher can't plant a fake `account_suspended` under their name. Reads are owner-scoped so teachers never see admin security events.                                          |
| Detail text                     | Name which **fields or records** changed, never old/new values, scores or comment text                                                                                                                                                                                                                                                                                                         | Audit entries are permanent (`allow update, delete: if false`); values would persist personal data forever.                                                                     |
| `targetUid` convention          | A person's uid for person-targeted actions. For class-scoped actions it holds the **class id** and `targetName` the class name (e.g. "Class 3A")                                                                                                                                                                                                                                               | The key is required by the existing rules. Renaming it to `targetId` is a larger change (rules, type, existing data) and is deferred (§15).                                     |
| One entry per save              | One summarised entry per register save / gradebook save / form submit (class, date or term, count) — never one per student or cell                                                                                                                                                                                                                                                             | Bounds Firestore writes and keeps the log readable. A re-save logs again ("saved", not "changed").                                                                              |
| Shared helper and labels        | `src/lib/auditLog.ts` (`buildAuditEntry`, `logAuditEvent`) and `src/lib/auditEvents.ts` (labels, categories)                                                                                                                                                                                                                                                                                   | Many writers repeating the shape is how `recordedAt` got missed before; many viewers repeating label maps is how raw slugs leaked into the UI.                                  |
| Pagination                      | **Previous / Next with Firestore cursors**, each page a cached React Query entry (§9)                                                                                                                                                                                                                                                                                                          | Firestore has no offsets; numbered pages need counts or full fetches and cost more reads.                                                                                       |
| Activity section layout         | Two segmented views, **"My activity"** (own `activity_log`) and **"Actions I performed"** (`audit_log` by `performedBy`), each paginated independently                                                                                                                                                                                                                                         | Merging two cursor-paged sources into one time-ordered feed needs two cursors and over-fetching. Students and parents see only "My activity".                                   |
| Audit Log scope filter          | A category filter — **All / Account & security / Academic** — built on `eventType in […]`                                                                                                                                                                                                                                                                                                      | Teacher events are routine and frequent; without a filter they bury security events on the page, the profile section and the Alerts widget.                                     |
| `super_admin` targets           | Not logged (same as the existing photo block)                                                                                                                                                                                                                                                                                                                                                  | `institutions/*` is not a real institution path, and `institutionId` must equal the path. Known gap (§15).                                                                      |
| `profile_edit`                  | New event type; `photo_change` stays separate                                                                                                                                                                                                                                                                                                                                                  | A photo has no meaningful field diff.                                                                                                                                           |

---

## 5. Data Model

No new collections or fields. Event types:

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
   | 'photo_change'
-  | 'session_reset';
+  | 'session_reset'
+  | 'profile_edit'
+  | 'attendance_edit'
+  | 'results_edit'
+  | 'comment_edit'
+  | 'lesson_note_edit';
```

The rules' allow-lists (§8) must list the same values.

---

## 6. Part A — Shared helpers

### 6.1 `src/lib/auditLog.ts`

```ts
import { addDoc, serverTimestamp } from "firebase/firestore";
import { institutionCollection } from "@/lib/paths";
import type { AuditEventType } from "@/lib/firebase";

export type AuditEventInput = {
  institutionId: string;
  eventType: AuditEventType;
  detail: string;
  targetUid: string; // a uid, or a class id for class-scoped actions (§4)
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
    detail:
      p.detail.length > MAX_DETAIL
        ? `${p.detail.slice(0, MAX_DETAIL - 1)}…`
        : p.detail,
    targetUid: p.targetUid,
    targetName: p.targetName,
    performedBy: p.performedBy,
    performedByName: p.performedByName,
    timestamp: new Date().toISOString(), // legacy ordering/display
    recordedAt: serverTimestamp(), // server-verified; rules require == request.time
    institutionId: p.institutionId,
  };
}

// Best-effort: callers that cannot batch with the primary write swallow failures themselves.
export async function logAuditEvent(p: AuditEventInput) {
  await addDoc(
    institutionCollection(p.institutionId, "audit_log"),
    buildAuditEntry(p),
  );
}
```

`logRegistrationAudit()` becomes a thin wrapper over `logAuditEvent()` (same public signature). The three `photo_change` writers, `AccountStatusToggle.tsx` and `SessionResetButton.tsx` (both inline copies of the shape inside a batch) migrate to `buildAuditEntry` in the same pass, so no inline copy survives. The `activity_log` writes next to the photo logs stay unchanged.

### 6.2 `src/lib/auditEvents.ts` (labels and categories)

One module, used by the Audit Log page, the profile sections and the Alerts widget:

- `AUDIT_EVENT_LABELS: Record<AuditEventType, string>` — `account_suspended` → "Account deactivated", `profile_edit` → "Profile edited", `attendance_edit` → "Attendance saved", and so on (a `Record` over the union means a new type that lacks a label fails `tsc`).
- `SECURITY_EVENT_TYPES` (`account_created`, `account_suspended`, `account_reactivated`, `account_deleted`, `password_reset`, `session_reset`, `permission_change`, `role_change`, `registration_status_change`) and `ACADEMIC_EVENT_TYPES` (`profile_edit`, `photo_change`, `attendance_edit`, `results_edit`, `comment_edit`, `lesson_note_edit`). Together they cover every type exactly once (tested). Each list is under the 30-value limit of an `in` query.
- `ACTIVITY_EVENT_LABELS` for `ActivityEventType` (including `profile_update`, which the profile currently shows as a raw slug), with a humanising fallback (`snake_case` → "Snake case") so an unknown type never renders as a slug.

### 6.3 Drift guard

A unit test reads `firestore.rules` with a Vite `?raw` import (the pattern the repo already uses; `node:fs` is rejected by `tsc -b`), extracts the `audit_log` allow-lists and asserts they equal the `AuditEventType` values and the labels map — so adding a type in one place and forgetting the other fails CI instead of failing in production with `permission-denied`.

---

## 7. Part B — Writers

Acting-user fields in every writer: `performedBy: user.uid`, `performedByName: displayName ?? user.email ?? "Administrator"` (a teacher: "Teacher"). **The institution is always the target's**, never the actor's (a super_admin's own is `'*'`); skip the entry when it is missing or `'*'`.

### 7.1 `profile_edit` — Student, Teacher and Parent forms (in the existing batch)

Diff helper `src/lib/profileEditDiff.ts`, **normalising** before comparing so a form round-trip doesn't report phantom changes:

```ts
const FIELD_LABELS: Record<string, string> = {
  firstName: "first name",
  lastName: "last name",
  email: "email",
  phone: "phone",
  phone2: "second phone",
  idNumber: "ID number",
  institutionStudentId: "student ID",
  dateOfBirth: "date of birth",
  gender: "gender",
  classId: "class",
  houseId: "house",
  departmentId: "department",
  assignedClassId: "homeroom class",
  homeroomRoom: "homeroom room",
  homeroomBuilding: "homeroom building",
  subjects: "subjects",
  linkedStudents: "linked students",
};

// undefined, null and "" are the same "empty"; strings are trimmed; Firestore
// Timestamps/Dates compare by millisecond value.
function normalise(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  if (v instanceof Date) return v.getTime();
  if (
    typeof v === "object" &&
    "toMillis" in v &&
    typeof (v as { toMillis: unknown }).toMillis === "function"
  ) {
    return (v as { toMillis(): number }).toMillis();
  }
  return v;
}

export function diffChangedFields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  fields: string[],
): string[] {
  return fields
    .filter((f) => normalise(before?.[f]) !== normalise(after[f]))
    .map((f) => FIELD_LABELS[f] ?? f);
}
```

- **StudentForm** fields: `firstName, lastName, email, phone, phone2, idNumber, institutionStudentId, dateOfBirth, gender, classId, houseId`. The email wording says the profile record's email changed; the form does not change the Auth sign-in email.
- **TeacherForm** fields: `firstName, lastName, phone, departmentId`, plus for senior teachers `assignedClassId, homeroomRoom, homeroomBuilding`, plus a synthetic `subjects` entry when the set of `selectedSubjectIds` differs from the pre-edit assignment (computed from `subjects[].teacherIds` before the loop runs). No `email`.
- **ParentForm** fields: `firstName, lastName, email, phone`, plus a synthetic `linkedStudents` entry when the selected links change. (No `address` field on this form.)

**The comparison base is the form's `data` prop** (what the list row passed in). A field the row doesn't carry would always look changed, so a test per form must cover its `data` shape (§13).

**Phone canonicalization (`PHONE_NUMBER_FORMATTING_SPEC.md` §5.2):** the three forms rewrite a stored bare, NANP-valid phone to `+1-XXX-XXX-XXXX` on submit (`canonicalizePhone`) when the institution's phone is `+1`. Diffing the raw `data.phone` against that value would report `phone` on an unrelated save, so `diffChangedFields` compares **canonical forms** for `phone` and `phone2` (run both sides through the same canonicalizer with the same institution context) — with a test where only the separators differ.

Inside the form's existing `onSubmit`, **before** `batch.commit()`:

```ts
const changed = diffChangedFields(data, formData, [
  /* the form's field list */
]);
if (
  changed.length > 0 &&
  user &&
  targetInstitutionId &&
  targetInstitutionId !== "*"
) {
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

`targetInstitutionId` is the row's institution (`TeacherForm` already has it; Student and Parent forms take it from `data.institutionId`, not `useAuth()`). **Tradeoff of batching:** a rules rejection of the audit entry fails the whole save — acceptable (record and change stay in step), and covered by the rule probes in §13. Post-commit photo logging stays a separate best-effort `logAuditEvent({ eventType: "photo_change" … })`.

### 7.2 `account_created` — `AdminCreateUserForm.tsx` (best-effort, after)

After the successful `batch.commit()`, alongside the existing photo-audit block, for every role **except `super_admin`**:

```ts
try {
  await logAuditEvent({
    institutionId: values.institutionId,
    eventType: "account_created",
    detail: `Created ${roleLabel} account for ${createdName}`,
    targetUid: createdUser.uid,
    targetName: createdName,
    performedBy: user.uid,
    performedByName: displayName ?? user.email ?? "Administrator",
  });
} catch {
  /* best-effort: the account already exists */
}
```

Best-effort, not in the creation batch: that batch is paired with a rollback that deletes the Auth user, and a failed log write must not undo a real account. `roleLabel` comes from `getRoleLabel` (`lib/firebase.ts`).

### 7.3 `password_reset` — `manage-admins/index.tsx` (best-effort, after)

`ResetCell` receives `{ id, name, email, institutionId }` (already on the row) and, **after** `sendPasswordResetEmail` resolves, logs `Sent password reset email to {name}` under the **target admin's** `institutionId` (skip if absent or `'*'`). The wording records the action, not that the password changed. A failed log write is swallowed; the cell still shows "Reset sent".

### 7.4 `permission_change` — `schedule/index.tsx` (best-effort, after)

In `handleToggle`, after the `updateDoc`, log `Granted`/`Revoked schedule-generation access for {name}` against `institutionId` (the admin's own, which is also the target's). Best-effort, since this is a lone `updateDoc`; convert to a batch if a second write is ever added.

### 7.5 Teacher events — attendance, results/gradebook, feedback, lesson notes (in the existing write)

One summarised entry per save, **in the same `writeBatch` as the change** (the two attendance sites and `ResultForm`/`FeedbackCommentForm` currently use a lone `setDoc`/`addDoc`/`updateDoc` and become a one-or-two-operation batch). Details name the class/subject/date/term and a count — never a student name list, score or comment text. `targetUid`/`targetName` follow the §4 convention.

| Event              | Site                                                                                                                     | Example `detail`                                                  | `targetUid` / `targetName`                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------ |
| `attendance_edit`  | `attendance/general`, `attendance/subject` (register save)                                                               | `Saved general attendance for Class 3A, 2026-10-02 (24 students)` | class id / class name                                  |
| `results_edit`     | `list/gradebook` (save batch; column delete batch → "Deleted column {label} and its results"), `ResultForm` (add/update) | `Saved gradebook for Class 3A, Mathematics, Term 1 (3 columns)`   | class id / class name (ResultForm: student uid / name) |
| `comment_edit`     | `FeedbackCommentForm` (create/update)                                                                                    | `Saved feedback comment for {student}, Mathematics`               | student uid / student name                             |
| `lesson_note_edit` | `LessonNoteForm` (create/update, existing batch)                                                                         | `Saved lesson note for Class 3A, Mathematics`                     | class id / class name                                  |

Implementation checks: (a) Firestore allows **500 operations per batch** — the gradebook save and column-delete batches can be large, so count operations and chunk (or split the audit entry into the last chunk) rather than assuming one extra op fits; (b) a re-save logs again; do not try to detect "no change" for registers and gradebooks; (c) the entry's institution is the teacher's own (`useAuth().institutionId`), which is the target's institution for these flows.

---

## 8. Part C — Firestore rules

Replace the whole `institutions/{institutionId}/audit_log/{eventId}` block (a **replacement**, not a diff, so no #66/#70 constraint — including `session_reset` — is dropped):

```text
function validAuditEntry(institutionId) {
  return request.resource.data.institutionId == institutionId
    && request.resource.data.keys().hasOnly([ /* unchanged key list */ ])
    && request.resource.data.keys().hasAll([ /* unchanged key list */ ])
    && request.resource.data.performedBy == request.auth.uid
    && request.resource.data.recordedAt == request.time
    && request.resource.data.detail is string
    && request.resource.data.detail.size() <= 300;
}

match /institutions/{institutionId}/audit_log/{eventId} {
  allow read: if isSuperAdmin()
    || (isAdmin() && myInstitutionId() == institutionId)
    || (isTeacher() && myInstitutionId() == institutionId
        && resource.data.performedBy == request.auth.uid);
  allow create: if validAuditEntry(institutionId)
    && (
      ((isSuperAdmin() || (isAdmin() && myInstitutionId() == institutionId))
        && request.resource.data.eventType in [
             'role_change','password_reset','account_created','account_suspended',
             'account_reactivated','account_deleted','permission_change',
             'registration_status_change','photo_change','session_reset',
             'profile_edit','attendance_edit','results_edit','comment_edit','lesson_note_edit'
           ])
      || (isTeacher() && myInstitutionId() == institutionId
        && request.resource.data.eventType in [
             'attendance_edit','results_edit','comment_edit','lesson_note_edit'
           ])
    );
  allow update, delete: if false;
}
```

Notes:

- **Admins may write every type** (an admin can edit results, attendance and lesson notes too). **Teachers may write only the four teacher types**, so a teacher cannot attribute a forged `account_suspended` or `password_reset` to themselves. (An earlier draft let teachers write any type.)
- The grouping keeps **every** shared condition applying to **every** role. (An earlier draft appended `|| (isTeacher() && …)` before the `&&` chain; `&&` binds tighter than `||`, so the admin branch would have skipped all the checks.)
- **A teacher's list query must include `where('performedBy', '==', uid)`** or the rules reject it; rules filter by resource, they do not trim results.
- No change to the `collectionGroup("audit_log")` block (super_admin-only) and none to the `users` update rule (the `status`, `canGenerateSchedule` and `sessionResetAt` writes already fall under its admin clause).

**Indexes** (`firestore.indexes.json`):

| Scope            | Fields                                           | Serves                                                                 |
| ---------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| COLLECTION       | `audit_log`: `performedBy` ASC, `timestamp` DESC | "Actions I performed" (admin, teacher)                                 |
| COLLECTION_GROUP | `audit_log`: `performedBy` ASC, `timestamp` DESC | "Actions I performed" (super_admin)                                    |
| COLLECTION       | `audit_log`: `eventType` ASC, `timestamp` DESC   | Category filter and the profile "security" section (institution_admin) |

The existing collection-group `eventType`+`timestamp` composite already serves the super_admin Alerts widget and the super_admin all-institutions category filter. Confirm each index is **built** before deploying the app.

**Rollout order:** rules and indexes first (additive: adds types and the teacher branch; nothing the current app sends is newly denied), then the app. This differs from #66's indexes → app → rules because here the app sends event types the old rules reject.

---

## 9. Part D — Pagination

### 9.1 Mechanism

A small shared hook, `src/hooks/useCursorPages.ts`, wraps React Query:

- State: `pageIndex` and a `cursors` array (`cursors[i]` = the last `QueryDocumentSnapshot` of page `i-1`; `cursors[0] = null`).
- Each page is a query keyed by the base key plus `pageIndex` (e.g. `['auditPage', institutionId, category, pageIndex]`), `staleTime: 5 * 60_000`, `placeholderData: keepPreviousData` (no layout jump while the next page loads). The `queryFn` runs `query(base…, orderBy('timestamp','desc'), startAfter(cursors[pageIndex]), limit(pageSize + 1))`.
- **Fetch `pageSize + 1`**: the extra document only decides whether **Next** is enabled (no empty trailing page) and is not rendered; its snapshot's predecessor becomes the next cursor. Cost: one extra document read per page.
- **Previous** is a cache hit (zero reads) while the page is fresh; **Next** is a read only the first time. Changing the institution select or the category filter resets `pageIndex` to 0 and the cursors.
- Entries carry their document id (`{ id: d.id, ...d.data() }`) and rows use it as the React key (fixes the `${eventType}-${timestamp}` collisions). Snapshots are kept in the cache entry (not only `data()`).
- Listeners are never used (`onSnapshot` would bill continuously on Spark).

### 9.2 Where it applies

| Surface                                                   | Source                                                                                                    | Page size | Notes                                                                                                                                                               |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit Log page (`/dashboard/admin/audit-log`)             | institution_admin: own `audit_log`; super_admin: the picked institution or `collectionGroup("audit_log")` | 20        | Replaces `limit(50)`; resolves #21. Header text "Showing the 50 most recent" becomes "Page N". Category filter (All / Account & security / Academic) resets paging. |
| Profile — "Audit and security events" (institution_admin) | own institution `audit_log`, **Account & security** category only                                         | 10        | Keeps the "View full audit log →" link. A super_admin keeps the link-only card (no single institution).                                                             |
| Profile — "My activity"                                   | `users/{uid}/activity_log`                                                                                | 10        | Every role. Owner read, already permitted.                                                                                                                          |
| Profile — "Actions I performed"                           | `audit_log` where `performedBy == uid`                                                                    | 10        | Staff only (§9.3).                                                                                                                                                  |

### 9.3 "Actions I performed" (the feature that prompted this spec)

```ts
// institution_admin / senior_teacher / regular_teacher
query(
  institutionCollection(institutionId, "audit_log"),
  where("performedBy", "==", user.uid),
  orderBy("timestamp", "desc"),
  startAfter(cursor),
  limit(pageSize + 1),
);

// super_admin (institutionId is the '*' sentinel): across institutions
query(
  collectionGroup(db, "audit_log"),
  where("performedBy", "==", user.uid),
  orderBy("timestamp", "desc"),
  startAfter(cursor),
  limit(pageSize + 1),
);
```

- Enabled only for staff roles with a real institution (super_admin uses the collection-group form), `DATA_MODE === 'live'`, and a uid. Students and parents never fire it.
- Each card shows the event label, `detail` and a "→ {targetName}" tag, and the time via the verified/unverified helper (§11).
- Legacy entries (written before `recordedAt` existed) display normally and keep their unverified marker.
- **Not covered:** a `super_admin` acting on a `super_admin` target is never logged (§15), and entries written before this ships obviously do not exist.

---

## 10. Part E — Audit Log page, profile and Alerts widget fixes

- **Audit Log page:** render the verified `recordedAt` with the same "(unverified)" fallback the profile uses (extract `fmtEntryTime` into a shared component/helper); event labels from §6.2 instead of raw slugs; an **error state** with Retry (a rejected query currently shows "No audit entries found"); rows keyed by document id; the category filter; the paging controls. Keep a single-institution select for super_admin.
- **Alerts widget (`AlertsFeed.tsx`):** change the query to `where('eventType', 'in', SECURITY_EVENT_TYPES)` + `orderBy('timestamp','desc')` + `limit(10)` (served by the existing collection-group `eventType`+`timestamp` index), so routine teacher entries never bury real alerts. Its message text stays `entry.detail`.
- **Profile Activity:** use `ACTIVITY_EVENT_LABELS` (so `profile_update` reads "Updated contact info"); the two views from §4; mock mode (`USE_MOCK`) keeps its static, unpaged data.
- **Unwritten Activity types** (`sign_out`, `password_change`, `notification_change`): **not wired by this spec** — owners may write only `sign_in` and `profile_update` under the current rules, and a sign-out write would add a Firestore write per sign-out. They keep a label for forward compatibility; wiring them is separate (§15).

---

## 11. Part F — Profile layout (no page stretch)

- Remove `h-[stretch]` from `Section` (`profile/index.tsx`) and add `items-start` to the two-column grid, so a tall right-hand section no longer forces the left-hand sections to stretch. Cards may end at different heights; that is the intended result. *(Amended later, see `ISSUES_AND_GAPS.md` #56: for every role but super_admin the Role-specific Details and Account Details cards now opt in to filling their columns, and Activity sits full width below, so the stretch cause above no longer applies.)*
- Bound each list: the page size (10) already caps the number of cards; additionally wrap the list in `max-h-[28rem] overflow-y-auto` with the pager **outside** the scroll area so the pager never scrolls away. Card text uses `wrap-anywhere` (long `detail` strings and names must not widen the card at phone width).
- The pager (Previous / Next, "Page N") is one small shared component used by all three paginated surfaces: ≥44 px touch targets on phones (the repo's `min-h-11 sm:min-h-0` pattern), disabled states, and a loading indicator that does not change the card height.
- The loading/empty/error states of each section render at a fixed minimum height so a page change does not make the profile jump.

---

## 12. Security Considerations

- **`performedBy` and `recordedAt` are rules-enforced** (shipped in #66). Entries are still client-written, so a compromised session can write misleading `detail` text; the tamper-proof alternative remains `ISSUES_AND_GAPS.md` #23 (needs Cloud Functions).
- **Teacher reads are owner-scoped and teacher writes are limited to four event types** (§8): extending the grant never exposes admin security events and never lets a teacher author a security event.
- **Entries are permanent** (`allow update, delete: if false`). Details record only field/record **names and counts**, never values, scores or comments; even so, "Updated date of birth for …" persists forever with no deletion path. Same retention posture as `photo_change`; worth the admin knowing before it ships.
- **Teacher actions become visible to admins** in the Audit Log (that is the point) and to the teacher in their own "Actions I performed".
- **Batching tradeoff** (§7.1, §7.5): a malformed audit entry fails the save. The shared `buildAuditEntry()` (key set, `recordedAt`, 300-char clamp) exists to make that unreachable, and the §6.3 drift test catches the one remaining way (a new type missing from the rules).
- **Deactivation takes effect immediately** (§3); nothing here relies on a "next sign-in" limitation.

---

## 13. Implementation Order & Testing

### Implementation order

Status of each step: ✅ done in the repo · ⏳ still needs a manual action.

1. ✅ `firebase.ts` — extend `AuditEventType` (§5); tidy the stale `'suspended'` (§3).
2. ✅ `src/lib/auditLog.ts`, `src/lib/auditEvents.ts`, `src/lib/profileEditDiff.ts`, `src/hooks/useCursorPages.ts`, the shared pager and time components — each with unit tests, including the §6.3 drift test (`auditRules.test.ts`; the hook layer itself is untested, see the header).
3. ⏳ **Deploy:** `firestore.rules` (§8) and the three new indexes, together; confirm the indexes are **built**. The rules and indexes are written, tested against `firebase deploy --dry-run` (rules compile) and committed, but **not deployed**.
4. ✅/⏳ Migrate the existing writers (`registrationAudit.ts`, the three `photo_change` sites, `AccountStatusToggle.tsx`, `SessionResetButton.tsx`) to the helper — no behaviour change. Done; re-running spec 11 and the registration-conversion flow by hand is still pending.
5. ✅ New admin writers (§7.1–7.4): `profile_edit` (Student, Teacher, Parent), `account_created`, `password_reset`, `permission_change`.
6. ✅ Teacher writers (§7.5): attendance → lesson notes → feedback comments → results/gradebook.
7. ✅ Pagination + Audit Log page + Alerts widget (§9, §10).
8. ✅ Profile: layout fix, paged sections, "Actions I performed" (§9.3, §11).
9. ✅/⏳ `e2e/11-users-lockdown.spec.ts` extended, `e2e/14-audit-activity.spec.ts` added, `ISSUES_AND_GAPS.md` #11 and #21 resolved (#44 added), the user guide updated (`USER_GUIDE.md` 1.3, 2.23, 3.11). **Not run:** both e2e specs (they need the step 3 deploy). Not updated: `DEMO_TESTING_GUIDE.md`.

### Testing

- Standing gate: `npx tsc -b`, `npx eslint .`, `npx vitest run`, `npm run build`.
- **Unit:** `diffChangedFields` (no change → empty; one field; several; `undefined`/`null`/`""` equal; whitespace trimmed; Timestamp vs Date vs millis; phone separators only; field missing from `before`); `buildAuditEntry` (exact rules key set including `recordedAt`; 300-char clamp); `AUDIT_EVENT_LABELS`/categories cover every type exactly once; the §6.3 rules-vs-type drift test; `useCursorPages` (first page, Next stores the cursor, Previous is a cache hit, filter change resets, `pageSize + 1` decides Next, empty result).
- **Per-form `data` shape:** an unchanged Student, Teacher or Parent form produces **no** `profile_edit` entry.
- **Rules probes** (extend `e2e/11-users-lockdown.spec.ts`): a teacher writing an audit entry is now **allowed** for a teacher event type with their own `performedBy`, **denied** for another's `performedBy`, **denied** for a non-teacher type (`account_suspended`, `password_reset`, `profile_edit`); a teacher can read an entry they wrote and **cannot** read an admin's; an unfiltered teacher list query is denied; an admin writing `session_reset` and each new type still succeeds; the "every audit event type the app writes" control includes all fifteen types.
- **End-to-end, one per writer:** create a student, edit a parent's phone, reset an admin's password (super_admin), toggle schedule access, save attendance, save a gradebook, add a feedback comment, save a lesson note — each produces exactly one correctly-shaped entry under the **target's** institution, and batched edits produce none when nothing changed.
- **Pagination:** with more than one page of entries, Next shows the following entries without repeats, Previous returns without a network read inside the 5-minute cache, Next is disabled on the last page, changing the category resets to page 1.
- **Feed:** an institution_admin and a teacher see their own actions under "Actions I performed"; a student/parent has no such view and fires no query; a super_admin sees actions across institutions.
- **Layout:** at phone width and desktop, a profile with 10 long Activity entries does not stretch the left-hand sections, the pager stays visible, and nothing overflows horizontally.
- **Regression:** registration conversion, deactivate/reactivate and "Clear session" still write one entry each; the Alerts widget shows no `attendance_edit`.

---

## 14. Free-Tier (Spark) Impact

- **Reads:** profile visit on a cold cache: audit section 11 + "My activity" 11 + "Actions I performed" 11 ≈ 33 documents (before: 25); a warm cache costs none and there are no listeners. Audit Log page: 21 per page viewed (before: 50 once); Previous costs nothing within the 5-minute cache. Alerts widget: unchanged (10).
- **Writes:** one extra document per audited action. Edits ride in the same batch (no extra round trip). A school saving attendance and gradebooks daily adds on the order of hundreds of writes per day across all schools sharing the project, against Spark's 20,000/day.
- **Storage:** entries are ~300 bytes; entirely negligible, but they are permanent, so volume only grows (§12).
- **Indexes:** three more composite indexes; no per-index cost on Spark beyond storage.

---

## 15. Explicitly Out of Scope / Deferred

- **`role_change`** — blocked by `roleNotChanged()` and the cascading-reference risk. Own future spec.
- **`account_deleted`** — needs the Admin SDK / Cloud Functions / Blaze plan, parked with institution deletion.
- **Renaming `targetUid` → `targetId`** — requires a rules, type and data migration; the §4 convention covers class-scoped entries meanwhile.
- **Writing the unused Activity types** (`sign_out`, `password_change`, `notification_change`) and refused-sign-in attempts (the one-session lock, #70) as Activity or security events.
- **Logging for `super_admin` targets** — no valid per-institution path; revisit with a platform-level audit location.
- **Tamper-proof logging** — client-written entries remain forgeable by a compromised session (`ISSUES_AND_GAPS.md` #23).
- **Old/new value history** — deliberately not recorded (§4, §12).
- **Date-range filter, CSV export, multi-institution selection** on the Audit Log page — `ISSUES_AND_GAPS.md` #20, #22, #26.
- **`student`/`parent` as `performedBy`** — no account-management capability, so nothing to log.
- **Student-facing "your record was changed by an admin" notices** — would need writes into the target's `activity_log` (and a rules change); not part of this spec.

---

## 16. Confirmed Decisions

These were open points before implementation; all four were confirmed and built as written.

1. **Two views, not one merged feed**, for "My activity" / "Actions I performed" (§4) — merged would need two cursors and over-fetching.
2. **Category filter** on the Audit Log page and a security-only profile section (§4, §9.2) — without it routine teacher entries swamp the security events.
3. **Teachers restricted to the four teacher event types** in the rules (§8), rather than any type.
4. **`targetUid` holding a class id** for class-scoped teacher actions (§4), rather than renaming the key now.
