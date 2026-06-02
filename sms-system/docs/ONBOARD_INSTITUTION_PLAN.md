# Onboard Institution — Two-Step Flow Implementation Plan

Two-step wizard accessible to `super_admin` only. Replaces the misleading "Onboard Institution" quick-action on the super_admin dashboard (which previously pointed to `/create-user`, a page that creates users but never touches the `institutions` collection). The new flow creates an `institutions` document first, then creates the `institution_admin` account for it in a single guided session.

---

## Status

> **Complete.** All five phases shipped. The implementation matches the design below with one deviation noted in Phase 1.

---

## User-Confirmed Design Decisions

| Decision | Choice |
|---|---|
| Step 2 skippable? | No — required to complete the flow |
| Role in step 2 | Locked to `institution_admin` |
| Post-completion destination | Stay on page, show success state |

---

## Files Created

| File | Purpose |
|---|---|
| `src/scenes/(dashboard)/super-admin/onboard-institution/index.tsx` | Page component — owns the step state machine |
| `src/components/forms/InstitutionForm.tsx` | Step 1 form — institution name input, writes to `institutions` collection |

## Files Modified

| File | Change |
|---|---|
| `src/components/forms/AdminCreateUserForm.tsx` | Added 3 optional props to support pre-filling and role locking |
| `src/App.tsx` | Registered the `/onboard-institution` route |
| `src/scenes/(dashboard)/super-admin/index.tsx` | Rerouted "Onboard Institution" quick-action from `/create-user` to `/onboard-institution` |

---

## Phase 1 — `InstitutionForm.tsx`

Single field: `name` (institution name).

**Zod schema:**
```ts
z.object({ name: z.string().min(1, 'Name is required.').max(100) })
```

**On submit:**
```ts
const ref = doc(collection(db, 'institutions')); // pre-generate ID without writing
await setDoc(ref, {
  name: values.name,
  institutionId: ref.id,   // mirrors the doc ID — required by schema
  createdAt: serverTimestamp(),
  status: 'active',
});
```

> **Deviation from original plan:** The plan specified `createdAt: new Date().toISOString()`. The implementation uses `serverTimestamp()` (updated as part of PR16 Item 14 — standardise all `createdAt` fields to server timestamps).

Using `doc(collection(...))` + `setDoc` (rather than `addDoc`) lets the generated ID be captured before the write and embedded in the document body as `institutionId`, satisfying the schema's denormalization requirement.

**Props:**
```ts
type InstitutionFormProps = {
  onSuccess: (institutionId: string, institutionName: string) => void;
};
```

**Styling:** Follows `AdminCreateUserForm`'s border-based input pattern (`border border-gray-300 dark:border-gray-700`, `bg-white dark:bg-gray-900`), not the ring-based pattern used in the Firestore-only forms, since it renders in the same admin visual context.

---

## Phase 2 — `AdminCreateUserForm.tsx` modifications

Three optional props added (all optional — existing call sites at `/create-user` pass none and are unaffected):

```ts
type AdminCreateUserFormProps = {
  initialInstitutionId?: string;
  lockedRole?: Role;
  onSuccess?: (userName: string) => void;
};
```

**Change 1 — `defaultValues`:** When `initialInstitutionId` is provided, it is set as the `institutionId` default. When `lockedRole` is provided, it is set as the `role` default.

**Change 2 — role field:** When `lockedRole` is set, the `<select>` is replaced with a disabled readonly input displaying `getRoleLabel(lockedRole)`. A `useEffect` keeps the registered `role` value in sync with the prop so Zod validation passes.

**Change 3 — `institutionId` field:** `|| !!initialInstitutionId` added to the existing `disabled` condition. A `useEffect` calls `setValue('institutionId', initialInstitutionId)` when the prop is present, parallel to the existing effect that pre-fills the field for `institution_admin` callers.

**Change 4 — success callback:** After the batch commit, if `onSuccess` is provided, `onSuccess(fullName)` is called instead of setting the internal success banner. The page component drives state transitions; the form's own success message only renders when `onSuccess` is absent (i.e., standalone `/create-user` usage).

**Signature:**
```ts
export default function AdminCreateUserForm({
  initialInstitutionId,
  lockedRole,
  onSuccess,
}: AdminCreateUserFormProps = {})
```

---

## Phase 3 — `OnboardInstitutionPage`

### State machine

```ts
type FlowState =
  | { step: 'step1' }
  | { step: 'step2'; institutionId: string; institutionName: string }
  | { step: 'done'; institutionId: string; institutionName: string; adminName: string };
```

Initialises as `{ step: 'step1' }`.

### Step indicator

A two-node horizontal stepper rendered at the top of the page across all three states. Completed nodes show a checkmark SVG; the current node shows its number; pending nodes are muted. The connector line between nodes turns sky-500 once the first step is complete.

```
● Create Institution  ——  ● Create Admin
```

### Step 1

```tsx
<InstitutionForm
  onSuccess={(id, name) =>
    setState({ step: 'step2', institutionId: id, institutionName: name })
  }
/>
```

### Step 2

```tsx
<AdminCreateUserForm
  initialInstitutionId={state.institutionId}
  lockedRole="institution_admin"
  onSuccess={(adminName) =>
    setState({ step: 'done', ...state, adminName })
  }
/>
```

A callout above the form reads: *"Institution created — completing this step links the admin account to it."* There is no Back button: step 1 has already committed to Firestore. See [Orphan Institution Caveat](#orphan-institution-caveat).

### Done state

A success card (emerald border/background) displaying:

- Institution name and its generated Firestore document ID (monospaced, for the super_admin's reference)
- Admin account full name

Two action buttons:

- **Go to Dashboard** — `<Link to="/">`
- **Onboard Another Institution** — calls `setState({ step: 'step1' })`

---

## Phase 4 — `App.tsx`

```tsx
import OnboardInstitutionPage from "@/scenes/(dashboard)/super-admin/onboard-institution";

// Inside <Routes>:
<Route
  path="/onboard-institution"
  element={
    role === 'super_admin'
      ? <OnboardInstitutionPage />
      : <Navigate to="/" replace />
  }
/>
```

Same guard pattern as `/admin/audit-log`.

---

## Phase 5 — `super-admin/index.tsx`

In the `quickActions` array, the href for "Onboard Institution" was changed:

```ts
// Before
href: "/create-user"

// After
href: "/onboard-institution"
```

The label "Onboard Institution" already described the new destination correctly — no label change required.

---

## Orphan Institution Caveat

Step 1 writes to Firestore before step 2 begins. If the super_admin navigates away (browser back, tab close) after step 1 but before completing step 2, an `institutions` document will exist with no associated `institution_admin`. The UI prevents intentional skipping (no skip button), but cannot prevent browser-level navigation.

**Mitigation (MVP):** The super_admin can use the regular `/create-user` page at any time to create an `institution_admin` and manually enter the orphaned institution's ID. No code change is required to recover.

**Long-term:** A background check on the super_admin dashboard could surface institutions with zero `institution_admin` users as a warning card. Tracked as a future enhancement — not in scope for this implementation.
