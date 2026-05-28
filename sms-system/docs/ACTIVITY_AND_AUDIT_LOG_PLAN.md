# Activity Log & Audit Log — Implementation Plan

**Status:** In progress — Pre-Implementation Checklist complete  
**Scope:** Profile page activity/audit cards, dedicated audit log page, Firestore schema, security rules, indexes, client-side write logic  
**Affects:** `firebase.ts`, `data.ts`, `profile/index.tsx`, new `/admin/audit-log` page, `firebase-rules.md`, Firestore Console

---

## Pre-Implementation Checklist

Three issues surfaced during planning that must be understood or resolved before implementation begins. They are detailed in their respective sections but are collected here as an explicit upfront checklist.

| # | Status | Item | Risk if skipped | Where addressed |
| --- | --- | --- | --- | --- |
| 1 | ✅ Done | Remove existing top-level `audit_logs` rule from Firebase Console | Two audit schemas coexist; the old rule may shadow or conflict with the new subcollection rules | Sections 2, 9.1 |
| 2 | ✅ Done | Create `institutions/_platform` sentinel document in Firestore Console | `super_admin` platform-level audit writes have no valid parent path; "Platform" option is absent from the audit log filter dropdown | Section 3.1 |
| 3 | ✅ Done | Add sign-in deduplication guard to `AuthContext` before the `sign_in` write is committed | `onAuthStateChanged` fires on every page refresh, writing a duplicate `sign_in` entry to `activity_log` each time | Section 8.3 |

---

## 1. Overview

### Problem

The "Activity" and "Audit and security events" cards on the profile page (`/profile`) contain hardcoded inline arrays that render the same literal strings regardless of the `USE_MOCK` feature flag.

### Goal

- In **Mock Data mode**: Activity card shows mock entries with the "Signed in" entry synthesized from `user.metadata.lastSignInTime` (real Firebase Auth metadata). Audit card shows mock admin events.
- In **Blank Data mode**: Both cards are hidden entirely (not rendered).
- For `super_admin` in live mode: the audit card shows a placeholder and a "View full audit log" button that navigates to a dedicated `/admin/audit-log` page where they can query by "All institutions" or a single specific institution.

### Collections Being Introduced

| Collection path | Purpose |
|---|---|
| `institutions/{institutionId}` | Parent collection for institutions. Required for audit_log subcollection. |
| `users/{uid}/activity_log/{eventId}` | Per-user activity log (sign-ins, profile edits). |
| `institutions/{institutionId}/audit_log/{eventId}` | Institution-scoped admin audit log (role changes, password resets, etc.). |

---

## 2. Existing Rule Conflict

`sms-system/docs/firebase-rules.md` currently defines a **top-level** `audit_logs` collection (plural, no subcollection):

```
match /audit_logs/{logId} {
  allow read: if isSuperAdmin();
  allow write: if false;   // ← backend/Admin SDK only
}
```

This plan introduces **`audit_log`** as a **subcollection** under `institutions/{institutionId}` (singular, different path) and **allows client-side writes** from `institution_admin` and `super_admin`. These are different paths and different rules — the existing top-level rule is not automatically overridden.

**Required action:** When the new rules are applied in the Firebase Console, the existing `match /audit_logs/{logId}` block should be removed or explicitly replaced with the new subcollection rules documented in Section 8 to avoid confusion between two audit log schemas.

> **Note:** If any data was previously written to the top-level `audit_logs` collection, it must be migrated or discarded before the old rule is removed. At the time of writing this document, no data is known to exist there since writes were blocked (`allow write: if false`).

---

## 3. New Firestore Collections

### 3.1 `institutions` Collection

This collection does not currently exist. It is a prerequisite for `institutions/{institutionId}/audit_log` subcollection paths.

**Document ID strategy:** Firebase auto-generated IDs. The generated ID becomes the canonical `institutionId` value stored in every `users/{uid}.institutionId` field for members of that institution.

**Workflow for creating an institution:**
1. In the Firestore Console, create a document in the `institutions` collection using an auto-generated ID.
2. Note the generated document ID (e.g., `xK8pL2mNqR4vW7`).
3. Set `institutionId: "xK8pL2mNqR4vW7"` on all `users/{uid}` documents belonging to that institution.

**Document schema:**

```
institutions/{institutionId}
  name:          string   // "Anytown Unified School District"
  institutionId: string   // mirrors the document ID — denormalized for queries
  createdAt:     string   // ISO 8601
  status:        'active' | 'inactive'
```

**`_platform` sentinel document:**

`super_admin` actions that have no institution scope (creating a new institution, platform-level configuration) need a home in the `audit_log` subcollection. A manually created sentinel document with the fixed ID `_platform` serves this purpose.

Create this document manually in the Firestore Console:

```
institutions/_platform
  name:          "Platform"
  institutionId: "_platform"
  createdAt:     <date of creation, ISO 8601>
  status:        "active"
```

This document will appear as the "Platform" option in the `super_admin` audit log filter on the dedicated audit log page. All super_admin actions with no institution scope are written to `institutions/_platform/audit_log/{eventId}`.

---

### 3.2 `activity_log` Subcollection

**Path:** `users/{uid}/activity_log/{eventId}`

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

**Who writes:** The app (client-side) writes entries at:
- Sign-in: in `AuthContext` after `onAuthStateChanged` fires with a non-null user
- Profile updates: after a successful Firestore write to `users/{uid}` from the profile page
- Photo updates: after a successful photo upload

---

### 3.3 `audit_log` Subcollection

**Path:** `institutions/{institutionId}/audit_log/{eventId}`

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

**Who writes:** The app (client-side) writes entries when an admin performs a privileged action (role change, password reset, account suspension). Each admin action in the UI that modifies another user's record should batch-write both the primary document change and the audit log entry atomically using a Firestore `WriteBatch`.

> **Trade-off — client vs. server writes:**  
> Client-side writes are simpler but carry a security risk: if rules are misconfigured, a malicious user could write fabricated audit entries. The correct long-term solution is Cloud Functions (Admin SDK), which cannot be forged. For MVP, client-side writes are acceptable provided the security rules (Section 8) tightly restrict who can write and what fields are accepted.

---

## 4. TypeScript Types

**File:** `sms-system/src/lib/firebase.ts`

Add the following beneath the existing `UserDocument` type:

```ts
export type InstitutionDocument = {
  name: string;
  institutionId: string;
  createdAt: string;
  status: 'active' | 'inactive';
};

export type ActivityEventType =
  | 'sign_in'
  | 'sign_out'
  | 'profile_update'
  | 'password_change'
  | 'photo_update'
  | 'notification_change';

export type ActivityLogEntry = {
  eventType: ActivityEventType;
  detail: string;
  timestamp: string;
  uid: string;
  institutionId: string;
};

export type AuditEventType =
  | 'role_change'
  | 'password_reset'
  | 'account_created'
  | 'account_suspended'
  | 'account_deleted'
  | 'permission_change';

export type AuditLogEntry = {
  eventType: AuditEventType;
  detail: string;
  targetUid: string;
  targetName: string;
  performedBy: string;
  performedByName: string;
  timestamp: string;
  institutionId: string;
};
```

---

## 5. Mock Data

**File:** `sms-system/src/lib/data.ts`

Add two private arrays and two conditional re-exports following the existing `USE_MOCK ? _x : []` pattern.

> **Important:** `_activityLogData` does NOT include the "Signed in" entry. That entry is synthesized in the profile component from `user.metadata.lastSignInTime` (real Firebase Auth metadata). `data.ts` has no access to the auth user object.

```ts
const _activityLogData = [
  {
    eventType: 'photo_update' as const,
    detail: 'Profile header',
    timestamp: '2026-01-25T14:10:00.000Z',
    uid: 'mock-uid',
    institutionId: 'mock-inst',
  },
  {
    eventType: 'notification_change' as const,
    detail: 'Email + SMS enabled',
    timestamp: '2026-01-20T11:05:00.000Z',
    uid: 'mock-uid',
    institutionId: 'mock-inst',
  },
];

const _auditLogData = [
  {
    eventType: 'password_reset' as const,
    detail: 'User: Sarah Brewer',
    targetUid: 'mock-uid-2',
    targetName: 'Sarah Brewer',
    performedBy: 'mock-uid',
    performedByName: 'Admin',
    timestamp: '2026-01-28T16:45:00.000Z',
    institutionId: 'mock-inst',
  },
  {
    eventType: 'role_change' as const,
    detail: 'Teacher to Department Lead',
    targetUid: 'mock-uid-3',
    targetName: 'Derek Briggs',
    performedBy: 'mock-uid',
    performedByName: 'Admin',
    timestamp: '2026-01-18T10:05:00.000Z',
    institutionId: 'mock-inst',
  },
];

export const activityLogData = USE_MOCK ? _activityLogData : [];
export const auditLogData    = USE_MOCK ? _auditLogData    : [];
```

---

## 6. Profile Page Changes

**File:** `sms-system/src/scenes/(dashboard)/profile/index.tsx`

### 6.1 Import changes

```ts
import { parentsData, studentsData, teachersData, activityLogData, auditLogData, USE_MOCK } from "@/lib/data";
```

### 6.2 Replace hardcoded arrays (lines 238–267)

Remove the existing `activity` and `auditEvents` inline constant arrays entirely. Replace with:

```ts
// Synthesize sign-in entry from Firebase Auth in mock mode only.
// fmtDateTime is already defined earlier in the component.
const signInEntry: typeof activityLogData = USE_MOCK && user?.metadata?.lastSignInTime
  ? [{
      eventType: 'sign_in',
      detail: 'Chrome on Windows',
      timestamp: user.metadata.lastSignInTime,
      uid: user.uid ?? 'mock-uid',
      institutionId: '',
    }]
  : [];

const activity    = [...signInEntry, ...activityLogData];  // [] in live mode
const auditEvents = auditLogData;                          // [] in live mode
```

### 6.3 Conditional card rendering

Replace the always-rendered Activity `<Section>` with:

```tsx
{activity.length > 0 && (
  <Section title="Activity" subtitle="Recent logins and profile updates.">
    <div className="space-y-3">
      {activity.map((item) => (
        <div
          key={`${item.eventType}-${item.timestamp}`}
          className="rounded-md border border-gray-100 dark:border-gray-700 p-3"
        >
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {item.eventType === 'sign_in'        ? 'Signed in'
             : item.eventType === 'photo_update'       ? 'Updated profile photo'
             : item.eventType === 'notification_change' ? 'Changed notification preferences'
             : item.eventType}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{item.detail}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {fmtDateTime(item.timestamp)}
          </p>
        </div>
      ))}
    </div>
  </Section>
)}
```

Replace the always-rendered Audit `<Section>` with:

```tsx
{(currentRole === 'institution_admin' || currentRole === 'super_admin') && (
  auditEvents.length > 0 ? (
    <Section
      title="Audit and security events"
      subtitle="Visible to admins only."
      action={
        currentRole === 'super_admin' ? (
          <a
            href="/admin/audit-log"
            className="text-xs font-semibold text-sky-600 hover:underline"
          >
            View full audit log →
          </a>
        ) : null
      }
    >
      <div className="space-y-3">
        {auditEvents.map((item) => (
          <div
            key={`${item.eventType}-${item.timestamp}`}
            className="rounded-md border border-gray-100 dark:border-gray-700 p-3"
          >
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {item.detail}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {item.eventType}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {fmtDateTime(item.timestamp)}
            </p>
          </div>
        ))}
      </div>
    </Section>
  ) : currentRole === 'super_admin' ? (
    // Live mode: super_admin sees placeholder + navigation button
    <Section title="Audit and security events" subtitle="Visible to admins only.">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        Platform-wide access — query audit events by institution on the audit log page.
      </p>
      <a
        href="/admin/audit-log"
        className="inline-block px-4 py-2 text-sm font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition"
      >
        View audit log
      </a>
    </Section>
  ) : null
)}
```

**Behavior summary:**

| Mode | `institution_admin` | `super_admin` |
|---|---|---|
| Mock | Shows 2 mock audit events | Shows 2 mock audit events + "View full audit log →" link |
| Live | Card hidden (auditEvents is empty) | Card shows placeholder text + "View audit log" button |

---

## 7. Dedicated Audit Log Page

**New file:** `sms-system/src/scenes/(dashboard)/admin/audit-log/index.tsx`  
**Route:** `/admin/audit-log` — register this route in the existing router configuration.  
**Access guard:** Redirect to `/` if `role !== 'super_admin'`.

### 7.1 Component responsibilities

1. On mount, fetch the list of all institutions from the `institutions` collection to populate the filter dropdown (names + IDs).
2. Default filter state: "All institutions" (`collectionGroup("audit_log")`).
3. On filter change: if a specific institution is selected, query `collection("institutions/{id}/audit_log")` directly; if "All institutions", use `collectionGroup("audit_log")`.
4. Results displayed in a list sorted by `timestamp` DESC.
5. Loading state while queries run; empty state when no results.

### 7.2 State shape

```ts
type FilterOption = { id: string; name: string };

const [institutions, setInstitutions]   = useState<FilterOption[]>([]);
const [selected, setSelected]           = useState<string>('__all__');  // '__all__' = all institutions
const [auditEntries, setAuditEntries]   = useState<AuditLogEntry[]>([]);
const [loading, setLoading]             = useState(false);
```

### 7.3 Fetching institutions list (runs once on mount)

```ts
useEffect(() => {
  async function loadInstitutions() {
    const snap = await getDocs(collection(db, 'institutions'));
    const list: FilterOption[] = snap.docs.map((d) => ({
      id: d.id,
      name: (d.data() as InstitutionDocument).name,
    }));
    // Sort: "Platform" sentinel first, then alphabetical by name
    list.sort((a, b) => {
      if (a.id === '_platform') return -1;
      if (b.id === '_platform') return 1;
      return a.name.localeCompare(b.name);
    });
    setInstitutions(list);
  }
  loadInstitutions();
}, []);
```

### 7.4 Query logic (runs when `selected` changes)

```ts
useEffect(() => {
  async function fetchAuditLog() {
    setLoading(true);
    try {
      let snap: QuerySnapshot;
      if (selected === '__all__') {
        // Collection Group query — all audit_log subcollections across all institutions
        snap = await getDocs(
          query(collectionGroup(db, 'audit_log'), orderBy('timestamp', 'desc'), limit(50))
        );
      } else {
        // Single institution subcollection query
        snap = await getDocs(
          query(
            collection(db, 'institutions', selected, 'audit_log'),
            orderBy('timestamp', 'desc'),
            limit(50)
          )
        );
      }
      setAuditEntries(snap.docs.map((d) => d.data() as AuditLogEntry));
    } finally {
      setLoading(false);
    }
  }
  fetchAuditLog();
}, [selected]);
```

### 7.5 Filter UI

A `<select>` dropdown rendered above the results list:

```tsx
<select
  value={selected}
  onChange={(e) => setSelected(e.target.value)}
  className="..."
>
  <option value="__all__">All institutions</option>
  {institutions.map((inst) => (
    <option key={inst.id} value={inst.id}>{inst.name}</option>
  ))}
</select>
```

### 7.6 Performance note — `limit(50)`

Collection Group queries scan every `audit_log` subcollection in the database. Applying `limit(50)` bounds the read cost per page. Pagination (load more / cursor-based) should be added before the audit log reaches significant volume. The current implementation is unbounded within 50 entries.

---

## 8. Client-side Write Logic

### 8.1 Where to write `activity_log` entries

In `sms-system/src/lib/AuthContext.tsx`, after `fetchRole` succeeds and `setLoading(false)` is called, write a `sign_in` entry:

```ts
import { collection, addDoc } from 'firebase/firestore';

// Inside fetchRole, after setLoading(false):
await addDoc(
  collection(db, 'users', uid, 'activity_log'),
  {
    eventType: 'sign_in',
    detail: '',             // browser/location info not available client-side without a UA parser
    timestamp: new Date().toISOString(),
    uid,
    institutionId: fetchedInstitutionId ?? '',
  }
);
```

> **Note:** Browser/device detail (e.g., "Chrome on Windows - Houston, TX") requires a User-Agent parser and optionally a geolocation API. For MVP, `detail` can be left as an empty string or `navigator.userAgent.slice(0, 80)` for a raw UA string.

For `profile_update` and `photo_update` entries, call `addDoc` immediately after the relevant Firestore write succeeds in the profile page component.

### 8.2 Where to write `audit_log` entries

Whenever `institution_admin` or `super_admin` performs a privileged action on another user, write an audit entry atomically with the primary change using a Firestore `WriteBatch`:

```ts
import { writeBatch, doc, collection } from 'firebase/firestore';

async function performRoleChange(
  targetUid: string,
  targetName: string,
  newRole: Role,
  adminUid: string,
  adminName: string,
  institutionId: string,
) {
  const batch = writeBatch(db);

  // Primary change
  batch.update(doc(db, 'users', targetUid), { role: newRole });

  // Audit log entry
  const auditRef = doc(collection(db, 'institutions', institutionId, 'audit_log'));
  batch.set(auditRef, {
    eventType: 'role_change',
    detail: `Role updated to ${newRole}`,
    targetUid,
    targetName,
    performedBy: adminUid,
    performedByName: adminName,
    timestamp: new Date().toISOString(),
    institutionId,
  } satisfies AuditLogEntry);

  await batch.commit();
}
```

Using a `WriteBatch` ensures the audit entry is never written without the primary change succeeding, and vice versa — they commit atomically or both fail.

### 8.3 Sign-in Deduplication Guard

**Problem:** `onAuthStateChanged` in `AuthContext` fires on every page load and hard refresh, not only on the user's first sign-in of a session. Without a guard, a `sign_in` entry is written to `activity_log` on every refresh, producing duplicate entries within the same session.

**Solution:** A `sessionStorage` flag. `sessionStorage` persists for the lifetime of the browser tab and is cleared automatically when the tab is closed or the user signs out. It does not persist across tabs (unlike `localStorage`), so opening a new tab correctly generates a new sign-in entry.

**Implementation in `AuthContext`** — wrap the `addDoc` call inside `fetchRole`, after all `setState` calls and before `setLoading(false)`:

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

> **Note on `detail`:** Browser/device info (e.g., "Chrome on Windows - Houston, TX") requires a User-Agent parser and optionally a geolocation API. For MVP, `detail` is left as an empty string. A raw UA string (`navigator.userAgent.slice(0, 80)`) can be substituted without any additional dependency.

**Clear the flag on sign-out** — in the `signOut` function in `AuthContext`:

```ts
async function signOut() {
  sessionStorage.removeItem(SESSION_SIGNIN_KEY);
  await firebaseSignOut(auth);
}
```

**Why `sessionStorage` over `lastSignInTime` comparison:**
Comparing `user.metadata.lastSignInTime` against the most recent `activity_log` entry would require an additional Firestore read on every page load. `sessionStorage` is synchronous, zero-cost, and accurate for the tab session — the correct trade-off for MVP.

---

## 9. Firestore Security Rules

Apply the following changes in the **Firebase Console → Firestore Database → Rules**.

### 9.1 Remove existing `audit_logs` rule

Remove the existing top-level `audit_logs` block:

```
// REMOVE this entire block:
match /audit_logs/{logId} {
  allow read: if isSuperAdmin();
  allow write: if false;
}
```

### 9.2 Add `institutions` collection rules

```
// ── Institutions ───────────────────────────────────────────────────────────
// Readable by all signed-in users (needed to populate institution name in
// the audit log filter dropdown). Only super_admin can create or modify.
match /institutions/{institutionId} {
  allow read: if isSignedIn();
  allow create: if isSuperAdmin();
  allow update: if isSuperAdmin();
  allow delete: if isSuperAdmin();
}
```

### 9.3 Add `activity_log` subcollection rules

```
// ── Activity log (per-user subcollection) ──────────────────────────────────
// Users read their own log. Admins read via Collection Group (see below).
// Users write their own entries (sign-in, profile updates).
// Admins cannot read individual subcollections via this rule — use Collection Group.
match /users/{uid}/activity_log/{eventId} {
  allow read:   if isOwner(uid);
  allow create: if isOwner(uid)
    && request.resource.data.uid == uid
    && request.resource.data.keys().hasAll(['eventType','detail','timestamp','uid','institutionId']);
  allow update, delete: if false;
}
```

### 9.4 Add `audit_log` subcollection rules

```
// ── Audit log (institution-scoped subcollection) ───────────────────────────
// institution_admin reads and writes their own institution's log.
// super_admin reads and writes any institution's log.
// Writes are batched with the primary change in the app layer.
match /institutions/{institutionId}/audit_log/{eventId} {
  allow read: if isSuperAdmin()
    || (isAdmin() && myInstitutionId() == institutionId);
  allow create: if (isSuperAdmin() || (isAdmin() && myInstitutionId() == institutionId))
    && request.resource.data.institutionId == institutionId
    && request.resource.data.keys().hasAll([
         'eventType','detail','targetUid','targetName',
         'performedBy','performedByName','timestamp','institutionId'
       ]);
  allow update, delete: if false;
}
```

### 9.5 Add Collection Group rules (admin cross-collection reads)

```
// ── Collection Group: activity_log ─────────────────────────────────────────
// Allows institution_admin and super_admin to query collectionGroup("activity_log").
// super_admin: platform-wide. institution_admin: scoped to their institutionId.
match /{path=**}/activity_log/{eventId} {
  allow read: if isSuperAdmin()
    || (isAdmin() && resource.data.institutionId == myInstitutionId());
}

// ── Collection Group: audit_log ────────────────────────────────────────────
// Allows super_admin to query collectionGroup("audit_log") across all institutions.
match /{path=**}/audit_log/{eventId} {
  allow read: if isSuperAdmin();
}
```

> **Performance note — `get()` calls in rules:**  
> Each helper function that calls `get(...)` (e.g., `me()`, `myRole()`, `myInstitutionId()`) counts as one Firestore read against your quota per rule evaluation. For low-traffic apps this is acceptable. At scale, the standard mitigation is to store `role` and `institutionId` as Firebase Auth custom claims via `setCustomUserClaims` in a Cloud Function, then replace all `get(...)` calls in rules with `request.auth.token.role` and `request.auth.token.institutionId`. This eliminates the extra reads entirely. Deferred to a future enhancement.

> **Wildcard Collection Group caveat:**  
> The `match /{path=**}/activity_log/{eventId}` pattern matches **any** collection named `activity_log` anywhere in the database, not just under `users/{uid}`. This is intentional — it is the only way to enable Collection Group queries in Firestore rules. The risk is mitigated by the `resource.data.institutionId == myInstitutionId()` field check for `institution_admin`, and by the fact that the write rules only allow writes to the known subcollection path.

---

## 10. Firestore Indexes

Navigate to **Firebase Console → Firestore Database → Indexes → Composite → Add index**.

Collection Group indexes are required for `collectionGroup(...)` queries to execute. Without them, Firestore returns an error with a direct link to create the missing index.

| Collection ID | Scope | Fields | Used by |
| --- | --- | --- | --- |
| `activity_log` | Collection group | `uid` ASC · `timestamp` DESC | Future: per-user admin lookup |
| `activity_log` | Collection group | `institutionId` ASC · `timestamp` DESC | `institution_admin` cross-user read |
| `audit_log` | Collection group | `institutionId` ASC · `timestamp` DESC | `super_admin` filtered query |
| `audit_log` | Collection group | `eventType` ASC · `timestamp` DESC | Future: filter by event type |
| `audit_log` | Collection (single) | `timestamp` DESC | `institution_admin` single-institution read |

> Single-field descending indexes (like `timestamp` DESC alone) are usually created automatically by Firestore. Composite indexes (two or more fields) must be created manually or via the link in the Firestore error message.

---

## 11. Performance Notes

- **Collection Group query cost:** A `collectionGroup("audit_log")` query with no filter scans every `audit_log` document across all institutions. Apply `limit(50)` and add cursor-based pagination before volume grows.
- **institutions list fetch:** The dropdown on `/admin/audit-log` fetches all `institutions` documents on mount. For a small number of institutions (< 200) this is a single inexpensive read. At scale, a `limit` and search should be added.
- **`WriteBatch` for audit writes:** Atomically committing the primary change and the audit entry is both safer (no partial state) and slightly more efficient (one round trip vs. two).
- **`addDoc` on every sign-in:** Writing a `sign_in` entry on every `onAuthStateChanged` event fires on page refresh too, not just the first login of a session. To avoid duplicate entries on refresh, check `user.metadata.lastSignInTime` against the most recent `activity_log` entry before writing, or use a session storage flag.

---

## 12. Trade-offs

| Decision | Trade-off |
|---|---|
| `activity_log` as subcollection under `users/{uid}` | Per-user reads are efficient; cross-user reads require Collection Group queries and composite indexes. |
| `audit_log` as subcollection under `institutions/{institutionId}` | Institution data is physically isolated; `super_admin` cross-institution reads require Collection Group queries. |
| Client-side audit writes | Simpler than Cloud Functions. Risk: rule misconfiguration could allow forged entries. Mitigation: strict field validation in rules + `allow update/delete: if false`. |
| `_platform` sentinel document | Provides a home for super_admin platform-level events without a special code path. Risk: `_platform` must be created manually before any super_admin writes; missing sentinel causes a write to a non-existent parent path (Firestore allows this, but rules may not). |
| `fmtDateTime` for activity timestamps | Reuses the existing helper already in the component. All timestamps stored as ISO 8601 in Firestore; display formatting is presentation-layer only. |
| `limit(50)` on audit log page | Bounds read cost per page load. Means recent events may not appear if more than 50 exist and the user doesn't paginate. Add pagination before audit log is in production use. |

---

## 13. Deferred / Future Enhancements

- **Multi-institution selection** for super_admin audit log filter (Firestore `in` filter or parallel queries).
- **Cursor-based pagination** on the `/admin/audit-log` page.
- **Date range filter** on the audit log page.
- **Cloud Functions write path** for tamper-proof audit entries (replace client-side `addDoc`).
- **Firebase Auth custom claims** for `role` and `institutionId` to eliminate `get()` calls in security rules.
- **Export to CSV** for audit log entries.
