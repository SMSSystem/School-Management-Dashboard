# Codebase Nuances & Reference Notes

Schema, implementation details, and operational notes for the activity log and audit log system.

---

## Collections

### `institutions` Collection

**Path:** `institutions/{institutionId}`

Top-level collection. Required as a parent path for the `audit_log` subcollection. Readable by all signed-in users — needed to populate the institution name in the audit log filter dropdown on `/admin/audit-log`. Only `super_admin` can create, update, or delete documents.

**Document ID strategy:** Firebase auto-generated IDs. The generated ID becomes the canonical `institutionId` value stored in every `users/{uid}.institutionId` field for members of that institution.

**Document schema:**

```
institutions/{institutionId}
  name:          string   // "Anytown Unified School District"
  institutionId: string   // mirrors the document ID — denormalized for queries
  createdAt:     string   // ISO 8601
  status:        'active' | 'inactive'
```

### `institutions/_platform` Sentinel Document

`super_admin` actions that have no institution scope (creating a new institution, platform-level configuration) need a home in the `audit_log` subcollection. A manually created sentinel document with the fixed ID `_platform` serves this purpose.

```
institutions/_platform
  name:          "Platform"
  institutionId: "_platform"
  createdAt:     <date of creation, ISO 8601>
  status:        "active"
```

This document appears as the "Platform" option in the `super_admin` audit log filter on `/admin/audit-log`. All super_admin actions with no institution scope are written to `institutions/_platform/audit_log/{eventId}`.

> **Note:** The `_platform` sentinel must exist before any super_admin audit writes with no institution scope are attempted. Firestore allows writes to subcollections of non-existent parent documents, but rules may not permit it depending on rule evaluation. Create this document manually in the Firestore Console.

---

## Subcollections

### `activity_log` — `users/{uid}/activity_log/{eventId}`

**Purpose:** Per-user record of sign-ins, sign-outs, and profile changes. Each user reads their own subcollection. Admins use a Collection Group query (`collectionGroup("activity_log")`) to read across users.

**Why `uid` and `institutionId` are stored as fields (denormalization):**  
Firestore Collection Group queries can only filter on document fields — not on path segments outside the matched collection name. Without these denormalized fields, `institution_admin` cannot filter a Collection Group query to only their users.

**Document schema:**

```
users/{uid}/activity_log/{eventId}
  eventType:     'sign_in' | 'sign_out' | 'profile_update' | 'password_change'
               | 'photo_update' | 'notification_change'
  detail:        string   // "Chrome on Windows - Houston, TX"
  timestamp:     string   // ISO 8601
  uid:           string   // denormalized — same as parent document ID
  institutionId: string   // denormalized — from users/{uid}.institutionId
```

**Who writes:** Client-side, at:
- Sign-in: `AuthContext` after `onAuthStateChanged` fires (deduplication-guarded — see [Sign-In Deduplication Guard](#sign-in-deduplication-guard))
- Profile updates: after a successful write to `users/{uid}` from the profile page
- Photo updates: after a successful photo upload

---

### `audit_log` — `institutions/{institutionId}/audit_log/{eventId}`

**Purpose:** Institution-scoped record of admin actions. `institution_admin` reads their own institution's subcollection. `super_admin` uses a Collection Group query to read across institutions. The `_platform` sentinel covers super_admin platform-level events.

**Document schema:**

```
institutions/{institutionId}/audit_log/{eventId}
  eventType:          'role_change' | 'password_reset' | 'account_created'
                    | 'account_suspended' | 'account_deleted' | 'permission_change'
  detail:             string   // "Role: Teacher → Department Lead"
  targetUid:          string   // uid of the user the action was performed on
  targetName:         string   // denormalized display name of target user
  performedBy:        string   // uid of the admin who acted
  performedByName:    string   // denormalized display name of admin
  timestamp:          string   // ISO 8601
  institutionId:      string   // mirrors the parent document ID — denormalized for Collection Group queries
```

**Who writes:** Client-side, when an admin performs a privileged action on another user. Each admin action should batch-write the primary document change and the audit entry atomically using a Firestore `WriteBatch`.

> **Trade-off — client vs. server writes:**  
> Client-side writes are simpler but carry a security risk: if rules are misconfigured, a malicious user could write fabricated audit entries. The correct long-term solution is Cloud Functions (Admin SDK), which cannot be forged. For MVP, client-side writes are acceptable provided the security rules tightly restrict who can write and what fields are accepted. Tracked as Issue #45 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md).

---

## Sign-In Deduplication Guard

**Problem:** `onAuthStateChanged` in `AuthContext` fires on every page load and hard refresh, not only on first sign-in. Without a guard, a `sign_in` entry is written to `activity_log` on every refresh — producing duplicates within the same session.

**Solution:** A `sessionStorage` flag. `sessionStorage` persists for the lifetime of the browser tab and is cleared when the tab is closed or the user signs out. It does not persist across tabs (unlike `localStorage`), so opening a new tab correctly generates a new sign-in entry.

**Implementation in `AuthContext`:**

```ts
const SESSION_SIGNIN_KEY = 'sms_signin_logged';

if (!sessionStorage.getItem(SESSION_SIGNIN_KEY)) {
  sessionStorage.setItem(SESSION_SIGNIN_KEY, '1');
  await addDoc(
    collection(db, 'users', uid, 'activity_log'),
    {
      eventType: 'sign_in',
      detail: '',
      timestamp: new Date().toISOString(),
      uid,
      institutionId: fetchedInstitutionId ?? '',
    }
  );
}
```

**Clear the flag on sign-out** — in the `signOut` function in `AuthContext`:

```ts
async function signOut() {
  sessionStorage.removeItem(SESSION_SIGNIN_KEY);
  await firebaseSignOut(auth);
}
```

**Why `sessionStorage` over `lastSignInTime` comparison:**  
Comparing `user.metadata.lastSignInTime` against the most recent `activity_log` entry would require an additional Firestore read on every page load. `sessionStorage` is synchronous, zero-cost, and accurate for the tab session.

> **Note on `detail`:** Browser/device info (e.g., "Chrome on Windows") requires a User-Agent parser and optionally a geolocation API. For MVP, `detail` is left as an empty string. A raw UA string (`navigator.userAgent.slice(0, 80)`) can be substituted without any additional dependency.

---

## Firestore Indexes

Collection Group indexes are required for `collectionGroup(...)` queries to execute. Without them, Firestore returns an error with a direct link to create the missing index.

Navigate to **Firebase Console → Firestore Database → Indexes → Composite → Add index**.

| Collection ID | Scope | Fields | Used by |
| --- | --- | --- | --- |
| `activity_log` | Collection group | `uid` ASC · `timestamp` DESC | Future: per-user admin lookup |
| `activity_log` | Collection group | `institutionId` ASC · `timestamp` DESC | `institution_admin` cross-user read |
| `audit_log` | Collection group | `institutionId` ASC · `timestamp` DESC | `super_admin` filtered query |
| `audit_log` | Collection group | `eventType` ASC · `timestamp` DESC | Future: filter by event type |
| `audit_log` | Collection (single) | `timestamp` DESC | `institution_admin` single-institution read |

> Single-field descending indexes (like `timestamp` DESC alone) are usually created automatically by Firestore. Composite indexes (two or more fields) must be created manually or via the link in the Firestore error message.

---

## Performance Notes

- **Collection Group query cost:** A `collectionGroup("audit_log")` query with no filter scans every `audit_log` document across all institutions. `limit(50)` bounds per-page read cost. Cursor-based pagination should be added before audit log volume grows — see Issue #43 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md).
- **institutions list fetch on `/admin/audit-log`:** Fetches all `institutions` documents on mount to populate the filter dropdown. Safe below ~200 institutions. At scale, add a `limit` and server-side search.
- **`WriteBatch` for audit writes:** Atomically committing the primary change and the audit entry is both safer (no partial state) and slightly more efficient (one round trip vs. two).
- **`addDoc` on sign-in:** Mitigated by the `sessionStorage` deduplication guard — see [Sign-In Deduplication Guard](#sign-in-deduplication-guard). Without the guard, `onAuthStateChanged` firing on every page refresh would produce duplicate `sign_in` entries.

### `get()` Calls in Security Rules

Each helper function that calls `get(...)` (e.g., `me()`, `myRole()`, `myInstitutionId()`) counts as one Firestore read against the daily quota per rule evaluation. For low-traffic apps this is acceptable. At scale, the standard mitigation is to store `role` and `institutionId` as Firebase Auth custom claims via `setCustomUserClaims` in a Cloud Function, then replace all `get(...)` calls in rules with `request.auth.token.role` and `request.auth.token.institutionId`. This eliminates the extra reads entirely. Tracked as Issue #46 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md).

---

## Trade-offs

| Decision | Trade-off |
|---|---|
| `activity_log` as subcollection under `users/{uid}` | Per-user reads are efficient; cross-user reads require Collection Group queries and composite indexes. |
| `audit_log` as subcollection under `institutions/{institutionId}` | Institution data is physically isolated; `super_admin` cross-institution reads require Collection Group queries. |
| Client-side audit writes | Simpler than Cloud Functions. Risk: rule misconfiguration could allow forged entries. Mitigation: strict field validation in rules + `allow update/delete: if false`. |
| `_platform` sentinel document | Provides a home for super_admin platform-level events without a special code path. Risk: `_platform` must be created manually before any super_admin writes; missing sentinel causes a write to a non-existent parent path. |
| `fmtDateTime` for activity timestamps | Reuses the existing helper already in the component. All timestamps stored as ISO 8601 in Firestore; display formatting is presentation-layer only. |
| `limit(50)` on audit log page | Bounds read cost per page load. Means recent events may not appear if more than 50 exist and pagination is not implemented. |

### Wildcard Collection Group caveat

The `match /{path=**}/activity_log/{eventId}` pattern used in Firestore security rules matches **any** collection named `activity_log` anywhere in the database, not just under `users/{uid}`. This is intentional — it is the only way to enable Collection Group queries in Firestore rules.

The risk is mitigated by two factors:

1. The `institution_admin` rule applies a `resource.data.institutionId == myInstitutionId()` field check, scoping reads to the admin's own institution.
2. The write rules only permit writes to the known subcollection path (`users/{uid}/activity_log`), so no unexpected `activity_log` collection can accumulate data.

---

## Form System — Design Constraints

Non-obvious design decisions and constraints in the form and CRUD system.

### Junction Collections — SubjectForm and ClassForm

**Teacher-to-subject assignments** are stored in the `teacher_subjects` junction collection, not on the subject document itself. `SubjectForm` creates and edits subject documents only; linking teachers to subjects requires a separate UI against `teacher_subjects` (see Issue #26 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md)).

**Authoritative teacher-class links** are stored in the `teacher_classes` junction collection. The `supervisor` field on a class document is a **denormalized display name** only — a convenience copy for display. `ClassForm` writes this field as free-text for now; in live mode it should become a dropdown populated from the institution's teacher list. Tracked as Issue #48 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md).

### Teacher Scope — LessonForm and ExamForm

`regular_teacher` can only create or edit lessons and exams for their own classes. `senior_teacher` can create or edit lessons and exams for any class in their department. **This scope difference is enforced at the Firestore rules layer** (`isClassTeacherFor` / `isSeniorTeacherFor` helpers) — not in the UI. Both teacher roles see an identical form. A write outside a teacher's permitted scope is denied by Firestore at runtime.

### ResultForm — Create and Update, with Locked Context Fields

`ResultForm` supports both create and update modes.

**Create mode** exposes the full set of inputs: `studentId`, `classId`, `termId`, `assessmentName`, `score`, `maxScore`, `weight` (only when the institution's grading system is `"weighted"`), and `date`.

**Update mode** intentionally restricts writes to assessment fields only — `assessmentName`, `score`, `maxScore`, `weight`, and `date`. The `studentId`, `classId`, and `termId` fields are not sent in the `updateDoc` call, making them immutable after a result is created. This is by design: a teacher correcting a score or assessment name should not be able to re-attribute the result to a different student, class, or term.

### ParentForm — Firebase Auth Fields Must Not Be Edited

`ParentForm` exposes only `phone` and `address`. **`name` and `email` must not appear as editable inputs** — they are Firebase Authentication credentials. Changing them requires Auth API calls (`updateEmail`, `updateProfile`), not a Firestore write. Exposing them in a Firestore form would silently fail to update Auth state.

### AnnouncementForm — `description` Field Not Yet in TS Type

`AnnouncementForm` includes a `description` textarea (optional, max 2000 chars). This field is **not yet present** in the local `Announcement` TypeScript type in `src/scenes/(dashboard)/list/announcements/index.tsx`, nor in any Firestore type definitions. It must be added to both when the data layer is connected. Tracked as Issue #51 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md).
