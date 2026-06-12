# Post-MVP Additions Specification

> **Purpose:** Authoritative reference for all feature additions and improvements planned for the `post-mvp-additions` branch. Records every design decision, justification, trade-off, code template, and implementation detail discussed during planning. Read this before implementing any item.
>
> **Date documented:** 2026-06-02
> **Last updated:** 2026-06-12
> **Branch:** `post-mvp-additions`
> **Status:** Implementation in progress — see Feature Inventory for per-item status.

---

## Feature Inventory

| # | Feature | Area | Implementation status |
| --- | --- | --- | --- |
| 1 | No-JS overlay card | `index.html` | Not started |
| 2 | Remove "Contact Admin" from login | Login page | Not started |
| 3 | 5-minute inactivity auto-logout | Auth / layout | Not started |
| 4 | `super_admin` → `institution_admin` password reset | Account management | Blocked on item 13 |
| 5 | `institution_admin` → subordinate roles password reset | Account management | Blocked on item 14 |
| 6 | `senior_teacher` can leave feedback for any student | Feedback form | **Form query implemented** — Firestore rule unverified |
| 7 | `senior_teacher` cannot edit grades | Results list | Not started |
| 8 | `regular_teacher` feedback scoped to subject's students | Feedback | **Form scoping implemented** (differs from spec — see section); list page filtering not done; Stage 2 blocked on SubjectForm |
| 9 | `regular_teacher` data visibility scoped to subject's students | Multiple list pages | Stage 1 not started; Stage 2 blocked on SubjectForm |
| 10 | `regular_teacher` grade editing scoped to subject's students | Results | Stage 1 not started; Stage 2 blocked on SubjectForm |
| 11 | Feedback comment field required | `FeedbackCommentForm` | **Already implemented** — no work needed |
| 12 | Feedback form: preset dropdown + free-text textarea | `FeedbackCommentForm` | **Implemented** — model differs from spec (see section) |
| 13 | `institution_admin` management view (new page) | `super_admin` area | Not started |
| 14 | Parent detail page (new page) | Parents list | Not started |

Items 4 and 5 both use `sendPasswordResetEmail` — see the [Password Reset section](#4--5-admin-initiated-password-reset-email) for the shared implementation.

---

## 1. No-JS overlay card

### What

A full-screen overlay card with backdrop blur, visible only when JavaScript is disabled. Placed in `index.html` as a `<noscript>` block rather than a React component, because React cannot render without JS.

### Why

Without a no-JS fallback, users on browsers with JS disabled see a completely blank white page with no explanation. This is a graceful degradation concern for a fully client-side React/Vite app.

### Key trade-off: backdrop blur with no content behind it

`backdrop-filter: blur()` blurs what is rendered *behind* the element. When JS is disabled, the React app never mounts, so the body contains only the bare HTML skeleton. The blur applies to that empty background — there is little visual content to blur. This is acceptable; the card itself is the primary visual element and the blur is a stylistic detail, not a functional one.

### Inline styles are required

Tailwind's stylesheet is injected by Vite (JS-dependent). In a no-JS scenario, no external CSS is available. All styles for the overlay must be written inline inside the `<noscript>` block.

### Template

```html
<!-- sms-system/index.html — inside <body>, before <div id="root"> -->
<noscript>
  <style>
    .ns-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      z-index: 9999;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .ns-card {
      background: #ffffff;
      border-radius: 12px;
      padding: 2rem 2.5rem;
      max-width: 420px;
      width: 90%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    .ns-card h1 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 0.75rem;
    }
    .ns-card p {
      font-size: 0.9rem;
      color: #64748b;
      line-height: 1.6;
      margin: 0;
    }
  </style>
  <div class="ns-overlay">
    <div class="ns-card">
      <h1>JavaScript Required</h1>
      <p>
        This application requires JavaScript to run. Please enable JavaScript
        in your browser settings and reload the page.
      </p>
    </div>
  </div>
</noscript>
```

### Current `index.html` structure (for reference)

```html
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
```

The `<noscript>` block is inserted between `<body>` and `<div id="root">`.

### Files affected

- `sms-system/index.html`

---

## 2. Remove "Contact Admin" from login

### What

Remove the "Don't have an account? Contact admin" footer from the login form.

### Why

The link's `href` is `"#"` — it is non-functional boilerplate. It implies a self-service account registration flow that does not exist. Accounts in this system are created exclusively by admins via the onboarding wizard (`/onboard-institution`) or the create-user page (`/create-user`).

### Exact location

[`sms-system/src/scenes/(auth)/login/index.tsx`](../src/scenes/(auth)/login/index.tsx) lines 97–100:

```tsx
// Remove this entire div — it is the only change needed
<div className="mt-4 text-sm text-gray-600">
  <span className="mr-2">Don&apos;t have an account?</span>
  <Link to="#" className="text-sky-600 hover:underline">Contact admin</Link>
</div>
```

The `Link` import at the top of the file (`import { useNavigate, Link } from 'react-router-dom'`) becomes unused after this removal and should also be removed.

### Files affected

- `sms-system/src/scenes/(auth)/login/index.tsx`

---

## 3. 5-minute inactivity auto-logout

### What

Automatically sign out a user after 5 continuous minutes of inactivity. Applies to `super_admin`, `institution_admin`, `senior_teacher`, `regular_teacher`. Does **not** apply to `student` or `parent`.

### Parameters (decided, not configurable)

| Parameter | Value | Decision basis |
| --- | --- | --- |
| Timeout | 5 minutes (300 000 ms) | Balances security with usability; 1 minute was too aggressive |
| Roles affected | `super_admin`, `institution_admin`, `senior_teacher`, `regular_teacher` | Student/parent sessions are lower-risk |
| Pause on modal/form open | **No** | Explicitly decided — no exceptions, no special-case logic |
| Reset on activity | Yes | `mousemove`, `keydown`, `click`, `scroll`, `touchstart` |

### Implication of "no pause" decision

If a user is mid-form when the timer fires, unsaved data will be lost and they will be redirected to `/login`. This is a known and accepted trade-off. No debounce, no form-state check, no modal-open check is performed.

### Architecture: custom hook mounted in DashboardLayout

`useInactivityLogout` is a side-effect-only hook with no return value. It is mounted once in `DashboardLayout` (`src/scenes/(dashboard)/index.tsx`), which wraps every authenticated page. This avoids duplicating the listener across individual pages.

`DashboardLayout` is currently a simple two-column shell:

```tsx
// src/scenes/(dashboard)/index.tsx — current
export default function DashboardLayout({ children }) {
  return (
    <div className="h-dvh flex ...">
      <div className="..."><Menu /></div>
      <div className="..."><Navbar />{children}</div>
    </div>
  );
}
```

Add `useInactivityLogout()` call inside the component body.

### Implementation template

```tsx
// src/hooks/useInactivityLogout.ts  (new file)
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const TIMEOUT_MS = 5 * 60 * 1000;
const WATCHED_EVENTS = [
  'mousemove', 'keydown', 'click', 'scroll', 'touchstart',
] as const;
const AFFECTED_ROLES = [
  'super_admin', 'institution_admin', 'senior_teacher', 'regular_teacher',
] as const;

export function useInactivityLogout(): void {
  const { role, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!role || !(AFFECTED_ROLES as readonly string[]).includes(role)) return;

    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await signOut();
        navigate('/login', { replace: true });
      }, TIMEOUT_MS);
    };

    WATCHED_EVENTS.forEach((e) =>
      window.addEventListener(e, reset, { passive: true })
    );
    reset(); // arm the timer on mount

    return () => {
      clearTimeout(timer);
      WATCHED_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [role, signOut, navigate]);
}
```

```tsx
// src/scenes/(dashboard)/index.tsx — add this call
import { useInactivityLogout } from '@/hooks/useInactivityLogout';

export default function DashboardLayout({ children }) {
  useInactivityLogout(); // ← add this line
  return ( /* unchanged */ );
}
```

### Files affected

- `sms-system/src/hooks/useInactivityLogout.ts` (new file)
- `sms-system/src/scenes/(dashboard)/index.tsx`

---

## 4 & 5. Admin-initiated password reset email

### What

- `super_admin` can send a password reset email to any `institution_admin` account (via the management view — item 13).
- `institution_admin` can send a password reset email to `senior_teacher`, `regular_teacher`, `student`, and `parent` accounts (via each role's detail page).

### Why `sendPasswordResetEmail` instead of directly setting a password

The Firebase client SDK's `updatePassword()` only works for the **currently signed-in user**. Setting another user's password requires the **Firebase Admin SDK**, which must run server-side. Without Cloud Functions (Blaze plan required), direct password setting is not possible on the Spark plan.

`sendPasswordResetEmail(auth, targetEmail)` is a free client-side call — no server required, no plan upgrade needed. The target user receives an email from Firebase and sets their own password. This is the accepted implementation.

### Placement: Option D — user detail pages

The trigger appears as an "Account Actions" card on the target user's detail page, not in the list row or the edit modal. This keeps the list row uncluttered and the edit modal focused on profile fields.

### Role and page matrix

| Admin role | Target role | Detail page |
| --- | --- | --- |
| `super_admin` | `institution_admin` | `/manage-admins` row (item 13) |
| `institution_admin` | `senior_teacher` | `/list/teachers/:id` (exists) |
| `institution_admin` | `regular_teacher` | `/list/teachers/:id` (exists) |
| `institution_admin` | `student` | `/list/students/:id` (exists) |
| `institution_admin` | `parent` | `/list/parents/:id` (new — item 14) |

### Shared `AccountActionsCard` component template

```tsx
// src/components/AccountActionsCard.tsx  (new shared component)
import { useState } from 'react';
import { sendPasswordResetEmail, getAuth } from 'firebase/auth';

interface Props {
  email: string;
}

export function AccountActionsCard({ email }: Props) {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(getAuth(), email);
      setSent(true);
    } catch {
      setError('Failed to send reset email. Verify the email address is correct.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md">
      <h2 className="text-base font-semibold mb-3">Account Actions</h2>
      <hr className="mb-3 border-gray-200 dark:border-gray-700" />
      {sent ? (
        <p className="text-sm text-green-600 dark:text-green-400">
          Password reset email sent to {email}.
        </p>
      ) : (
        <button
          onClick={handleReset}
          disabled={loading}
          className="text-sm px-4 py-2 rounded-md border border-sky-400 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 disabled:opacity-50"
        >
          {loading ? 'Sending…' : 'Send Password Reset Email'}
        </button>
      )}
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </div>
  );
}
```

Usage on a detail page (both teachers and students follow the same pattern):

```tsx
// Rendered in the right-column of the detail page, beneath existing cards
// Only shown to the role with authority over this account type
{(role === 'institution_admin' || role === 'super_admin') && (
  <AccountActionsCard email={teacher.email ?? ''} />
)}
```

### Guard condition

The button should only render when the viewing role has authority over the target role. The detail pages are already gated by `Protected` and the router, so this is a belt-and-suspenders check within the page component rather than a security control.

### Files affected

- `sms-system/src/components/AccountActionsCard.tsx` (new shared component)
- `sms-system/src/scenes/(dashboard)/list/teachers/[id]/index.tsx`
- `sms-system/src/scenes/(dashboard)/list/students/[id]/index.tsx`
- `sms-system/src/scenes/(dashboard)/list/parents/[id]/index.tsx` (new — item 14)
- `sms-system/src/scenes/(dashboard)/super-admin/manage-admins/index.tsx` (new — item 13)

---

## 6. `senior_teacher` can leave feedback for any student

### What

A `senior_teacher` can create and edit feedback comments for any student in their institution — not limited to a specific class or subject.

### Current state

**Form query: implemented.** `FeedbackCommentForm` runs a live Firestore `onSnapshot` against the `users` collection (`role == 'student'`, `institutionId` filter) and exposes the full institution-scoped student list. Mock data is no longer used for the student dropdown.

**Remaining:** Verify (and update if needed) that the `senior_teacher` write rule in the Firebase Console allows writes for any student in the same institution with no class-level restriction. This cannot be confirmed from the client codebase alone.

### Files affected

- `sms-system/src/components/forms/FeedbackCommentForm.tsx` ✓ done
- Firebase Console: `feedback_comments` write rule — unverified

---

## 7. `senior_teacher` cannot edit grades

### What

`senior_teacher` loses the ability to update result records. They retain read access (results list remains visible to them).

### Existing behaviour

[`list/results/index.tsx` line 104](../src/scenes/(dashboard)/list/results/index.tsx#L104):

```tsx
// Current condition — shows edit button for any teacher who created the result
{(item.teacherId === user?.uid || role === "institution_admin" || role === "super_admin") && (
  <FormModal table="result" type="update" data={item} id={item.id} />
)}
```

Because `item.teacherId === user?.uid` evaluates to `true` for results a `senior_teacher` originally created, they can currently edit those results.

The results page has no create button — there is no create-path concern to address separately.

### Required change — UI

Tighten the condition to allow edits only for `regular_teacher` (owner) or admin roles:

```tsx
// Updated condition
{(
  (role === 'regular_teacher' && item.teacherId === user?.uid) ||
  role === 'institution_admin' ||
  role === 'super_admin'
) && (
  <FormModal table="result" type="update" data={item} id={item.id} />
)}
```

### Required change — Firestore rules

Update the `results` update rule in the Firebase Console to deny writes from `senior_teacher`. The UI change is not a security control — it must be backed by a rule.

### Files affected

- `sms-system/src/scenes/(dashboard)/list/results/index.tsx`
- Firebase Console: `results` update rule

---

## 8, 9, 10. `regular_teacher` subject-scoped access

### Overview

`regular_teacher` access to results, feedback comments, students, and eventually exams/assignments/lessons is scoped to students enrolled in the classes associated with the teacher's subjects.

Items 8, 9, and 10 are a single cohesive feature grouped into three numbered items:

| Item | What is scoped |
| --- | --- |
| 8 | Feedback comment creation and list |
| 9 | Data visibility across list pages |
| 10 | Result creation and list |

### Critical dependency: subject data model

This feature depends on live Firestore `subjects` documents containing `teacherIds` and `classIds` fields. **These fields do not exist in the current data model.** The current codebase has:

- `subjects` documents (in mock data): `{ id, name, teachers: string[] }` — `teachers` is an array of display names, not UIDs; no `classIds` field.
- `teachers/{uid}` documents: `{ teacherType, departmentId }` — no `subjectId`.
- `SubjectForm`: a `console.log` stub — writes nothing to Firestore.

The fields cannot be populated until `SubjectForm` is wired to Firestore. **SubjectForm wiring is explicitly deferred** — it will be implemented separately, not as part of this additions branch.

### Two-stage deployment

#### Stage 1 — implement now (this branch)

- Client-side filtering logic added to results, feedback, and students list pages.
- Subject query runs for `regular_teacher` in live mode: `where('teacherIds', 'array-contains', uid)`.
- **Firestore write rules are unchanged.** `regular_teacher` can still write results and feedback for any student in their institution (same as today). The subject scoping is UI-only.
- Interim behavior: if no subjects have the teacher's UID in `teacherIds` (SubjectForm not yet wired), filtered pages show the explanatory empty state (see below).

#### Stage 2 — deploy when SubjectForm ships (separate future branch)

- `SubjectForm` writes `teacherIds`, `teacherNames`, `classIds`, `classNames`, `classScope` to `subjects/{id}`.
- `ResultForm` and `FeedbackCommentForm` write `subjectId` onto each created document (required for Firestore rule enforcement — see rule-engine limitation note below).
- Firestore write rules for `results` and `feedback_comments` tightened for `regular_teacher` to enforce subject-class scoping.

> **Stage 1 and Stage 2 must be deployed atomically when SubjectForm ships.** Tightening Firestore rules before subject documents are populated with `teacherIds` would lock all `regular_teacher` users out of writing results and feedback in live mode.

---

### Subject data model (full specification)

This is the agreed canonical shape for `subjects/{id}` documents in Firestore. SubjectForm must write exactly these fields when it is eventually implemented.

```typescript
// Firestore: subjects/{id}
interface SubjectDocument {
  name: string;
  description?: string;
  institutionId: string;

  // Class association
  classScope: 'institution' | 'class';
  // 'institution' → subject applies to all students in the institution
  // 'class'       → subject applies only to students in classIds
  classIds: string[];    // UIDs of associated classes; always [] when classScope === 'institution'
  classNames: string[];  // denormalized display names written at save time

  // Teacher assignment
  teacherIds: string[];    // Firebase Auth UIDs of assigned teachers
  teacherNames: string[];  // denormalized display names written at save time
}
```

#### Why `classScope` + `classIds` instead of `classIds` alone

An empty `classIds: []` is ambiguous: it could mean "institution-wide" or "not yet configured". The explicit `classScope: 'institution' | 'class'` field makes intent unambiguous. When `classScope === 'institution'`, `classIds` is always empty and is ignored in all filtering and rule logic.

#### User-facing options in SubjectForm (future)

The SubjectForm UI will present three options to the user. They map to two model values:

| SubjectForm UI option | `classScope` | `classIds` |
| --- | --- | --- |
| Entire institution | `'institution'` | `[]` |
| Single class | `'class'` | `['<classId>']` |
| Multiple classes | `'class'` | `['<classId1>', '<classId2>', …]` |

"Single" vs "multiple" classes are both represented by `classScope: 'class'` — the distinction is simply `classIds.length`. No third enum value is needed.

#### Implication: institution-wide subject = teacher sees all students

A `regular_teacher` assigned to a subject with `classScope: 'institution'` will see all students in the institution. This is intentional and by design — it is the `institution_admin`'s responsibility to configure subjects appropriately.

#### Why `teacherIds: string[]` (UIDs, not display names)

Firestore rules evaluate `request.auth.uid in resource.data.teacherIds`. Client-side queries use `where('teacherIds', 'array-contains', uid)`. Both require UIDs. The existing mock `subjects[].teachers` array stores display names — this is display-only mock data and does not represent the live document shape.

#### Denormalization of `classNames` and `teacherNames`

Consistent with the existing codebase-wide denormalization strategy (teacher names, subject names, etc. written at write time). Avoids secondary Firestore reads in list views and PDF rendering.

---

### Pages scoped (by data mode)

| Page | File | Stage | `mock` mode | `live` mode | `blank` mode |
| --- | --- | --- | --- | --- | --- |
| Results list | `list/results/index.tsx` | 1 | Mock data, no filter | Filtered | Empty |
| Feedback list | `list/feedback/index.tsx` | 1 | Mock data, no filter | Filtered | Empty |
| Students list | `list/students/index.tsx` | 1 | Mock data, no filter | Filtered | Empty |
| Exams list | `list/exams/index.tsx` | 2 | — | — | — |
| Assignments list | `list/assignments/index.tsx` | 2 | — | — | — |
| Lessons list | `list/lessons/index.tsx` | 2 | — | — | — |

Stage 2 pages are deferred until those form write paths are implemented (currently `console.log` stubs).

---

### Client-side scoping utility (Stage 1)

Add to `sms-system/src/lib/utils.ts`:

```typescript
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Resolves the set of classIds a regular_teacher has access to, based on
 * their subject assignments. Returns 'institution' if any assigned subject
 * is institution-wide (meaning the teacher sees all students).
 * Returns an empty Set if no subjects are assigned.
 */
export async function resolveTeacherAllowedClassIds(
  institutionId: string,
  uid: string,
): Promise<Set<string> | 'institution'> {
  const snap = await getDocs(
    query(
      collection(db, 'subjects'),
      where('institutionId', '==', institutionId),
      where('teacherIds', 'array-contains', uid),
    )
  );

  if (snap.empty) return new Set(); // no subjects assigned

  const hasInstitutionScope = snap.docs.some(
    (d) => d.data().classScope === 'institution'
  );
  if (hasInstitutionScope) return 'institution';

  return new Set<string>(
    snap.docs.flatMap((d) => (d.data().classIds as string[]) ?? [])
  );
}

/** Filters a list of rows to those whose classId is in the allowed set. */
export function filterByAllowedClasses<T extends { classId: string }>(
  rows: T[],
  allowed: Set<string> | 'institution',
): T[] {
  if (allowed === 'institution') return rows;
  return rows.filter((r) => allowed.has(r.classId));
}
```

Usage in list pages (results, feedback, students):

```tsx
const [allowedClassIds, setAllowedClassIds] =
  useState<Set<string> | 'institution' | null>(null);

useEffect(() => {
  if (role !== 'regular_teacher' || USE_MOCK || !institutionId || !user?.uid) return;
  resolveTeacherAllowedClassIds(institutionId, user.uid).then(setAllowedClassIds);
}, [role, institutionId, user?.uid]);

// Apply filter only for regular_teacher in live mode
const scopedData =
  role === 'regular_teacher' && !USE_MOCK && allowedClassIds !== null
    ? filterByAllowedClasses(allData, allowedClassIds)
    : allData;
```

---

### Interim empty state (Stage 1, live mode only)

When a `regular_teacher` has no subjects with their UID in `teacherIds` (SubjectForm not yet wired and no manual data seeded), the filtered result is an empty set.

Behavior per data mode:

| `DATA_MODE` | Reason for empty | Display |
| --- | --- | --- |
| `live` | No subject assignments in Firestore yet | Explanatory message |
| `blank` | Normal blank state | Standard empty table |
| `mock` | Should not occur (mock data passes through unfiltered) | Normal mock rows |

```tsx
// Explanatory empty state — rendered inside Table or below it, live mode only
{DATA_MODE === 'live' && role === 'regular_teacher' && scopedData.length === 0 && (
  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
    No subject assignments found. Contact your institution admin to be
    assigned to a subject before viewing this data.
  </p>
)}
```

---

### `FeedbackCommentForm` student dropdown scoping (item 8)

The student dropdown must only show students from the teacher's allowed classes in live mode.

```tsx
// In FeedbackCommentForm — combine the live student fetch (item 6)
// with the allowed-class filter for regular_teacher

const studentOptions = useMemo(() => {
  if (USE_MOCK) return studentsData as unknown as StudentOption[];
  if (role === 'regular_teacher' && allowedClassIds !== null && allowedClassIds !== 'institution') {
    return liveStudents.filter((s) => allowedClassIds.has(s.classId));
  }
  return liveStudents; // senior_teacher, institution_admin, super_admin: all students
}, [liveStudents, role, allowedClassIds]);
```

---

### Firestore rule changes (Stage 2 only — do not deploy before SubjectForm ships)

#### Rule-engine limitation

Firestore security rules cannot perform multi-document joins or array-contains lookups across collections. The following **cannot** be expressed in a single rule:

```
// NOT POSSIBLE in Firestore rules:
// "allow if any subject document has uid in teacherIds AND the result's classId in classIds"
```

#### Solution: denormalize `subjectId` onto result and feedback documents at write time

When Stage 2 is implemented, `ResultForm` and `FeedbackCommentForm` must write `subjectId` onto each created document. The Firestore rule can then do a single `get()` on that subject document to check `request.auth.uid in subjectDoc.data.teacherIds`.

```
// Pseudocode for Stage 2 results update rule (regular_teacher branch):
allow update: if request.auth != null
  && callerRole == 'regular_teacher'
  && callerInstitutionId == resource.data.institutionId
  && request.auth.uid == resource.data.teacherId  // can only edit own results
  && request.auth.uid in get(
       /databases/$(database)/documents/subjects/$(resource.data.subjectId)
     ).data.teacherIds;
```

This requires `subjectId` to be a field on every `result` document, written by `ResultForm.onSubmit`. The same pattern applies to `feedback_comments`.

---

### Files affected (items 8/9/10)

- `sms-system/src/lib/utils.ts` — add `resolveTeacherAllowedClassIds`, `filterByAllowedClasses`
- `sms-system/src/scenes/(dashboard)/list/results/index.tsx`
- `sms-system/src/scenes/(dashboard)/list/feedback/index.tsx`
- `sms-system/src/scenes/(dashboard)/list/students/index.tsx`
- `sms-system/src/components/forms/FeedbackCommentForm.tsx`
- Firebase Console: `results` and `feedback_comments` write rules (**Stage 2 only**)

---

## 11. Feedback comment field required

### Status: Already implemented — no work needed

The Zod schema in [`FeedbackCommentForm.tsx` line 13](../src/components/forms/FeedbackCommentForm.tsx#L13) already enforces this:

```typescript
comment: z.string().min(1, "Comment is required.").max(2000),
```

No change is needed.

---

## 12. Feedback form: preset dropdown + free-text textarea

### Status

**Implemented**, but the delivered model differs from this spec's original design. The differences are documented below. No further work is needed on this item unless the preset list itself needs to change.

### What was originally specified

- A dropdown of **15 generic free-text** preset comments.
- The selected text would be submitted directly as the `comment` field when the textarea is empty.
- `commentNumber` was not a concept — the Zod schema was unchanged from item 11 (`comment` as the single validated field).

### What was actually implemented

The `FeedbackCommentForm` was extended as part of the SubjectForm spec (a separate implementation track), which introduced a `commentNumber` field alongside `comment`. The preset pattern therefore works differently:

- **20 domain-specific comments** are defined in `sms-system/src/lib/commentKey.ts` as `COMMENT_KEY: readonly string[]`.
- The dropdown is bound to a `commentNumber` field (integer 1–20) via `react-hook-form` and is a **required** Zod field: `z.coerce.number().int().min(1).max(20)`.
- The `comment` field (free-text textarea) remains required by Zod (`min(1)`).
- **Override logic in `onSubmit`** (matches the intent of the original spec):

  ```typescript
  const resolvedComment =
    formData.comment.trim() !== ""
      ? formData.comment
      : COMMENT_KEY[formData.commentNumber - 1];
  ```

- Both `comment` (resolved text) and `commentNumber` (the selected integer) are written to the Firestore document, allowing the comment to be reconstructed by number on future reads.

### Override logic (as implemented)

| Textarea | Dropdown (`commentNumber`) | `comment` written to Firestore |
| --- | --- | --- |
| Non-empty | Anything | Textarea value |
| Empty | Selected (1–20) | `COMMENT_KEY[commentNumber - 1]` |
| Empty | Not selected | Zod fails on both fields |

### Preset options (20 — `COMMENT_KEY` in `src/lib/commentKey.ts`)

```
1.  A very keen student who has maintained a high standard of performance.
2.  A hardworking and capable student.
3.  A dependable and eager student who takes pride in his/her work.
4.  Works consistently and is making some progress.
5.  Shows interest and is making some progress.
6.  Fair performance but can do better.
7.  Tries but finds the subject difficult.
8.  Has a good grasp of the facts but unable to express them effectively.
9.  Has potential but does not work hard enough.
10. Shows little interest in the subject.
11. Usually works well, but has difficulty with an examination.
12. Needs to read more.
13. Must pay more attention to details.
14. With greater application his/her work should improve.
15. Very confident.
16. Demonstrates initiative.
17. Disappointing exam results.
18. Slow, needs extra help.
19. Disruptive in class.
20. Needs individual attention.
```

### Affected files

- `sms-system/src/components/forms/FeedbackCommentForm.tsx` ✓ done
- `sms-system/src/lib/commentKey.ts` ✓ done

---

## 13. `institution_admin` management view (new page)

### What

A new page for `super_admin` to view, manage, and send password reset emails to `institution_admin` accounts.

### Scope: Full CRUD + password reset

| Action | Details |
| --- | --- |
| List | Paginated table of all `institution_admin` users: name, email, linked institution, status |
| Edit | Edit name, phone, address (`users/{uid}` merge write — same fields as `TeacherForm`) |
| Delete | Delete Firestore `users/{uid}` document + Firebase Auth account (same `writeBatch` + `deleteUser` pattern as the rest of the codebase) |
| Password reset | "Send Password Reset Email" button per row (or on a detail sub-view within the page) using `AccountActionsCard` (item 4/5) |
| Create | **Not on this page.** First admin is created by the onboarding wizard. Additional admins are created via `/create-user`. This view does not duplicate that flow. |

### Navigation and entry point

**No new sidebar menu item** — keeps the sidebar clean. The view is accessible only via the "Manage Admins" quick action card on the super_admin dashboard.

The quick action currently points to `/settings` (a placeholder). That `href` will be updated to `/manage-admins`.

Current quick action definition in [`super-admin/index.tsx` line 65](../src/scenes/(dashboard)/super-admin/index.tsx#L65):

```tsx
// Before
{ label: "Manage Admins", icon: "/setting.png", href: "/settings", colorClasses: "..." }

// After
{ label: "Manage Admins", icon: "/setting.png", href: "/manage-admins", colorClasses: "..." }
```

### Route

```tsx
// App.tsx — add this route
import ManageAdminsPage from "@/scenes/(dashboard)/super-admin/manage-admins";

<Route
  path="/manage-admins"
  element={role === 'super_admin' ? <ManageAdminsPage /> : <Navigate to="/" replace />}
/>
```

### Firestore query

```tsx
// Fetch institution_admin users
onSnapshot(
  query(collection(db, 'users'), where('role', '==', 'institution_admin')),
  (snap) => setAdmins(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
);
```

### Page layout

Follows the same list-page pattern used throughout the dashboard:
- Search bar + filter/sort icon buttons at top
- Paginated `<Table>` component
- Actions column per row: edit modal (`FormModal` pattern) + delete button + password reset button

### Files affected

- `sms-system/src/scenes/(dashboard)/super-admin/manage-admins/index.tsx` (new file)
- `sms-system/src/App.tsx` — add route
- `sms-system/src/scenes/(dashboard)/super-admin/index.tsx` — update "Manage Admins" href

---

## 14. Parent detail page (new page)

### What

A new detail page for parent accounts at `/list/parents/:id`, consistent with the existing teacher (`/list/teachers/:id`) and student (`/list/students/:id`) detail pages.

### Why this page is needed

Parents have no detail page and no view button in the parents list. For `institution_admin` to send a password reset email to a parent account via the Option D placement (item 5), a detail page is required. Rather than make an exception for parents and place the trigger in the edit modal, a proper detail page is built to maintain consistency.

### Minimum sections

1. **Profile card** — name, email, phone, address, linked student names.
2. **Account Actions card** — `AccountActionsCard` component (item 4/5), visible to `institution_admin` and `super_admin`.

### Changes to parents list page

Add a view button to each parent row. The parents list currently has no view button and no detail link. Add a circular `bg-lamaSky` button with `/view.png` (matching the teachers list pattern) and wrap it in a `Link` to `/list/parents/${item.id}`.

```tsx
// In parents list renderRow — add before the edit/delete buttons
<Link to={`/list/parents/${item.id}`}>
  <button className="w-7 h-7 flex items-center justify-center rounded-full bg-lamaSky">
    <img src="/view.png" alt="" width={16} height={16} />
  </button>
</Link>
```

### Route

```tsx
// App.tsx — add this route
import SingleParentPage from "@/scenes/(dashboard)/list/parents/[id]";

<Route path="/list/parents/:id" element={<SingleParentPage />} />
```

### Files affected

- `sms-system/src/scenes/(dashboard)/list/parents/[id]/index.tsx` (new file)
- `sms-system/src/scenes/(dashboard)/list/parents/index.tsx` — add view button + `Link`
- `sms-system/src/App.tsx` — add route

---

## Suggested implementation order

Items are independent of each other except where noted. This order minimises risk by starting with the smallest, most isolated changes.

| Step | Item(s) | Reason for position |
| --- | --- | --- |
| 1 | Item 2 — remove "Contact Admin" | One-line deletion; zero risk |
| 2 | Item 1 — no-JS overlay | Isolated to `index.html`; no TS/React changes |
| 3 | Item 7 — `senior_teacher` no grade edits | One condition change + one rule update |
| 4 | Item 3 — inactivity logout hook | New hook + one mount site; no existing code modified |
| 5 | Item 6 — `senior_teacher` feedback any student | Form query + rule; self-contained |
| 6 | Item 12 — feedback dropdown + textarea | UI-only change to `FeedbackCommentForm` |
| 7 | Items 8/9/10 Stage 1 — `regular_teacher` scoping | New utility + filter in 3 pages |
| 8 | Item 14 — parent detail page | Required before item 5 can be completed |
| 9 | Item 5 — `institution_admin` password reset | Needs item 14 (parent detail page) |
| 10 | Item 13 — `institution_admin` management view | New page; self-contained |
| 11 | Item 4 — `super_admin` password reset | Needs item 13 (management view) |

Item 11 (feedback field required) requires no work — already implemented.

---

## Open items and deferred work

### Items 8/9/10 Stage 2 — blocked on SubjectForm

When `SubjectForm` is eventually wired to Firestore (separate future branch), the following must be delivered **in a single deployment**:

1. `SubjectForm` writes `teacherIds`, `teacherNames`, `classIds`, `classNames`, `classScope` to `subjects/{id}`.
2. `ResultForm` writes `subjectId` onto each created `results` document.
3. `FeedbackCommentForm` writes `subjectId` onto each created `feedback_comments` document.
4. Firestore write rules for `results` and `feedback_comments` tightened for `regular_teacher`.

Items 2 and 3 are required because of the Firestore rule-engine limitation described in the items 8/9/10 section — rules cannot perform multi-document joins, so `subjectId` must be denormalized onto the document at write time.

**Do not tighten the Firestore rules before steps 1–3 are deployed.** Doing so will lock all `regular_teacher` users out of writing results and feedback.

### Exams, assignments, lessons — regular_teacher scoping

Scoping for these three pages (Stage 2, item 9) is deferred until those form write paths are implemented. The pages currently use `console.log` stubs and write nothing to Firestore.

### `subjectId` field on legacy result/feedback documents

When Stage 2 deploys, existing `results` and `feedback_comments` documents created before this change will not have a `subjectId` field. The Firestore rules should account for this (e.g., allow updates to documents with no `subjectId` if the caller is the original `teacherId`, to avoid locking teachers out of editing their own pre-migration records).

### This spec file

This file should be updated as implementation progresses. When an item is implemented and deployed, mark its status in the Feature Inventory table at the top. When Stage 2 of items 8/9/10 is deployed, update the open items section accordingly.
