# Brand Data Architecture Specification

> **Purpose:** Authoritative reference for the institution brand data feature. Records every design decision, justification, trade-off, code template, Firebase rule, and implementation detail. Read this before implementing any part of this feature.
>
> **Date documented:** 2026-06-13
> **Branch:** `post-mvp-additions`
> **Status:** Spec only — not yet implemented.

---

## Feature Summary

A `super_admin` can input brand data for any institution during onboarding or at any time thereafter. An `institution_admin` can view and edit their own institution's brand data. Brand data is stored on the existing `institutions/{id}` Firestore document and in Firebase Storage (for images). The institution's brand color is applied as the accent color across the dashboard for all users tied to that institution.

---

## Design Decisions (Q&A)

| Question | Answer |
|---|---|
| How are logo/coat of arms images stored? | File upload to Firebase Storage |
| What is the scope of brand color application? | Accent color only — replaces the sky-blue accent throughout the UI |
| Where does `super_admin` enter brand data? | New step in the existing `/onboard-institution` wizard; editable post-onboarding via `/brand-settings` |
| Can `institution_admin` edit their own brand data? | Yes — view and edit |

---

## 1. Firestore Schema

Brand data fields are added to the **existing** `institutions/{id}` document. No new collection is created.

```typescript
// Firestore: institutions/{id}
interface InstitutionDocument {
  // existing fields
  name: string;
  status: 'active' | 'inactive';

  // new brand fields — all optional except name (which already exists)
  motto?: string;         // institution motto or tagline
  phone?: string;         // contact phone number
  email?: string;         // contact email address
  address?: string;       // physical address
  brandColor?: string;    // hex string e.g. "#1e40af"
  logoUrl?: string;       // Firebase Storage download URL
  coatOfArmsUrl?: string; // Firebase Storage download URL
}
```

### Notes

- All new fields are optional. An institution document without brand fields is valid — the UI falls back to the default theme and shows no logo.
- `brandColor` stores the raw hex string as entered by the user (e.g. `"#1e40af"`). No normalisation to uppercase or shorthand is performed.
- `logoUrl` and `coatOfArmsUrl` store Firebase Storage **download URLs**, not storage paths. Download URLs are permanent and do not require auth to resolve (Storage rules control write access, not read access for authenticated users).

---

## 2. Firebase Storage Structure

```
gs://<bucket>/
  institutions/
    {institutionId}/
      logo            ← no file extension; always overwritten in place
      coat-of-arms    ← no file extension; always overwritten in place
```

### Why no file extension

Storing files at a fixed path (no extension) means:
- Updating the logo overwrites the previous file — no orphaned files accumulate.
- The download URL changes on each upload (Firebase Storage generates a new token), so the Firestore `logoUrl` field must be updated after every upload. This is handled by the form's submit flow.
- No cleanup logic is needed.

### Firebase Storage Security Rules

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /institutions/{institutionId}/{file} {

      // Any authenticated user can read institution assets (logos displayed in UI)
      allow read: if request.auth != null;

      // super_admin can write to any institution's files
      // institution_admin can write only to their own institution's files
      allow write: if request.auth != null && (
        firestore.get(
          /databases/(default)/documents/users/$(request.auth.uid)
        ).data.role == 'super_admin'
        ||
        (
          firestore.get(
            /databases/(default)/documents/users/$(request.auth.uid)
          ).data.role == 'institution_admin'
          &&
          firestore.get(
            /databases/(default)/documents/users/$(request.auth.uid)
          ).data.institutionId == institutionId
        )
      );
    }
  }
}
```

---

## 3. Firestore Security Rules Update

The existing `institutions` collection rules must be updated to allow `institution_admin` to update their own institution document. Add alongside the existing `super_admin` write rule.

```
match /institutions/{institutionId} {
  allow read: if request.auth != null;

  allow write: if request.auth != null && (
    // super_admin can write to any institution
    get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'super_admin'
    ||
    // institution_admin can write only to their own institution
    (
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'institution_admin'
      &&
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.institutionId == institutionId
    )
  );
}
```

---

## 4. AuthContext Extension

### Current shape

```typescript
interface AuthContextValue {
  user: User | null;
  role: string | null;
  institutionId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
}
```

### New shape

```typescript
// New type — only the subset of InstitutionDocument fields needed at runtime
interface InstitutionBrand {
  name: string;
  motto?: string;
  phone?: string;
  email?: string;
  address?: string;
  brandColor?: string;
  logoUrl?: string;
  coatOfArmsUrl?: string;
}

interface AuthContextValue {
  user: User | null;
  role: string | null;
  institutionId: string | null;
  institution: InstitutionBrand | null;  // ← new
  loading: boolean;
  signOut: () => Promise<void>;
}
```

### Fetch behaviour

In the `onAuthStateChanged` handler, after the user document is resolved:

- If `institutionId` is `'*'` (i.e. `super_admin`): set `institution = null`. Super admins are platform-level and have no single institution.
- If `institutionId` is a real ID: fire a **one-time `getDoc`** on `institutions/{institutionId}` and store the result as `institution`.
- If the institution document does not exist or the fetch fails: set `institution = null` and continue (non-fatal).

The fetch is `getDoc` (one-time), not `onSnapshot` (real-time). Brand data changes are infrequent; a page refresh after saving is acceptable. Using `onSnapshot` here would add a persistent listener for every logged-in session with no meaningful benefit.

### Files affected

- `sms-system/src/lib/AuthContext.tsx`

---

## 5. Dynamic Accent Color — CSS Custom Properties

### Mechanism

The current codebase uses `bg-lamaSky`, `bg-lamaSkyLight`, and related Tailwind utility classes as the primary accent throughout the UI (sidebar active state, KPI card backgrounds, icon buttons, quick-action cards, form modal triggers). These are custom Tailwind colors defined in `tailwind.config.js`.

Rather than change every component that uses these classes, the Tailwind color values themselves are changed to reference a CSS custom property. Setting the custom property at runtime then propagates the brand color to all components automatically.

### Step 1 — `tailwind.config.js`

```js
// Before (hardcoded hex values):
lamaSky:      '#C3EBFA',
lamaSkyLight: '#EDF9FD',

// After (derived from CSS custom property using color-mix):
lamaSky:      'color-mix(in srgb, var(--brand-accent) 30%, white)',
lamaSkyLight: 'color-mix(in srgb, var(--brand-accent) 10%, white)',
```

The `30%` and `10%` weights were chosen to match the visual lightness of the current `lamaSky` and `lamaSkyLight` hex values when `--brand-accent` is set to the current default sky blue.

### Step 2 — `src/index.css`

Add the default custom property to `:root`. This ensures the existing appearance is preserved for `super_admin` users (who have no institution brand) and for users whose institution has no `brandColor` set.

```css
:root {
  --brand-accent: #7CC2EC; /* default sky-blue — matches current lamaSky source color */
}
```

### Step 3 — `BrandApplicator` component

A side-effect-only component that reads the brand color from `AuthContext` and applies or removes the CSS custom property on the document root.

```tsx
// sms-system/src/components/BrandApplicator.tsx
import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';

export function BrandApplicator() {
  const { institution } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    if (institution?.brandColor) {
      root.style.setProperty('--brand-accent', institution.brandColor);
    } else {
      root.style.removeProperty('--brand-accent'); // falls back to :root default in index.css
    }
  }, [institution?.brandColor]);

  return null;
}
```

Mount it in `DashboardLayout` alongside `useInactivityLogout`:

```tsx
// sms-system/src/scenes/(dashboard)/index.tsx
import { useInactivityLogout } from '@/hooks/useInactivityLogout';
import { BrandApplicator } from '@/components/BrandApplicator';

export default function DashboardLayout({ children }) {
  useInactivityLogout();
  return (
    <>
      <BrandApplicator />
      <div className="h-dvh flex ...">
        {/* unchanged */}
      </div>
    </>
  );
}
```

### Why `color-mix()` instead of a JS lightening utility

`color-mix()` runs entirely in the browser at paint time — no JavaScript hex parsing, no additional npm dependencies, no runtime computation. The derived light tints update instantly whenever `--brand-accent` changes.

**Browser support:** Chrome 111+, Firefox 113+, Safari 16.2+. All modern browsers. No polyfill needed for the target user base (school admin dashboards are not accessed from legacy browsers).

### Known constraint — dark brand colors

`color-mix(in srgb, var(--brand-accent) 30%, white)` produces a **light tint** suitable for backgrounds where dark text sits on top. If the brand hex is a dark color (e.g. `#0a0a2e` — navy), the 30% mix will still be relatively dark and the existing dark text (`text-gray-800`) will have poor contrast.

**Mitigation:** Document in the `BrandForm` UI with a guidance note:

> "For best results, choose a mid-range or light color. Very dark colors may reduce text readability in the dashboard."

A future enhancement could auto-detect luminance and adjust text color accordingly, but this is out of scope for this spec.

### Dark mode note

The current dark mode variants (e.g. `dark:bg-sky-900/40`) use hardcoded Tailwind color classes and are **not** affected by `--brand-accent`. Dark mode accents remain unchanged in this implementation. Extending the brand color to dark mode would require additional CSS variables (e.g. `--brand-accent-dark`) and separate `color-mix()` expressions mixing with black rather than white. This is deferred.

---

## 6. `BrandForm` Component

A shared form used in both the onboarding wizard step and the standalone brand settings edit page.

### File

`sms-system/src/components/forms/BrandForm.tsx`

### Props

```typescript
interface BrandFormProps {
  institutionId: string;
  initialData?: Partial<InstitutionBrand>; // pre-populates fields for edit mode
  onSuccess?: () => void;                  // called after a successful save (e.g. advance wizard step)
}
```

### Zod schema

```typescript
import { z } from 'zod';

const schema = z.object({
  name:        z.string().min(1, 'Institution name is required.'),
  motto:       z.string().optional(),
  phone:       z.string().optional(),
  email:       z.string().email('Invalid email address.').optional().or(z.literal('')),
  address:     z.string().optional(),
  brandColor:  z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color (e.g. #1e40af).')
    .optional()
    .or(z.literal('')),
});

type BrandFormInputs = z.infer<typeof schema>;
```

Image files are handled outside Zod via separate `useState` refs (file inputs are not easily validated by Zod in react-hook-form).

### Submit flow

```typescript
const onSubmit = handleSubmit(async (formData) => {
  setSubmitting(true);
  const updates: Partial<InstitutionDocument> = { ...formData };

  // 1. Upload logo if a new file was selected
  if (logoFile) {
    const logoRef = ref(storage, `institutions/${institutionId}/logo`);
    const snapshot = await uploadBytes(logoRef, logoFile);
    updates.logoUrl = await getDownloadURL(snapshot.ref);
  }

  // 2. Upload coat of arms if a new file was selected
  if (coatOfArmsFile) {
    const coaRef = ref(storage, `institutions/${institutionId}/coat-of-arms`);
    const snapshot = await uploadBytes(coaRef, coatOfArmsFile);
    updates.coatOfArmsUrl = await getDownloadURL(snapshot.ref);
  }

  // 3. Merge-write brand fields to Firestore
  await setDoc(doc(db, 'institutions', institutionId), updates, { merge: true });

  setSubmitting(false);
  onSuccess?.();
});
```

### UI elements

| Field | Input type | Notes |
|---|---|---|
| Institution name | `<input type="text">` | Required |
| Motto | `<input type="text">` | Optional |
| Phone | `<input type="tel">` | Optional |
| Email | `<input type="email">` | Optional; validated by Zod |
| Physical address | `<textarea>` | Optional; multi-line |
| Brand color | `<input type="color">` + `<input type="text">` | Paired: color picker sets hex input and vice versa |
| Logo | `<input type="file" accept="image/*">` + thumbnail preview | Shows current `logoUrl` as preview if set |
| Coat of arms | `<input type="file" accept="image/*">` + thumbnail preview | Shows current `coatOfArmsUrl` as preview if set |

**Brand color input pairing pattern:**

```tsx
<div className="flex items-center gap-2">
  <input
    type="color"
    value={watch('brandColor') || '#7CC2EC'}
    onChange={(e) => setValue('brandColor', e.target.value)}
    className="w-10 h-10 rounded cursor-pointer border border-gray-300"
  />
  <input
    type="text"
    {...register('brandColor')}
    placeholder="#1e40af"
    className="ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-32"
  />
</div>
```

**Image field pattern (logo — coat of arms follows same pattern):**

```tsx
{/* Thumbnail preview of current image */}
{currentLogoUrl && !logoFile && (
  <img src={currentLogoUrl} alt="Current logo" className="w-16 h-16 object-contain rounded" />
)}
{/* New file preview */}
{logoFile && (
  <img src={URL.createObjectURL(logoFile)} alt="New logo preview" className="w-16 h-16 object-contain rounded" />
)}
<input
  type="file"
  accept="image/*"
  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
  className="text-sm"
/>
```

### Files affected

- `sms-system/src/components/forms/BrandForm.tsx` (new file)

---

## 7. Entry Points

### A. Onboarding wizard — new "Brand & Profile" step

The existing `/onboard-institution` page gains a second step. The institution document and `institutionId` must exist before this step is reached (Storage upload needs a target path).

**Proposed wizard step order:**

| Step | Content |
|---|---|
| 1 | Institution details — name, status (existing) |
| 2 | Brand & Profile — `BrandForm` (new) |
| 3 | Create first admin account (existing, if applicable) |

Step 2 is **skippable** — all brand fields in `BrandForm` are optional except `name`, which is carried over from step 1 and pre-populated as read-only.

The wizard passes the newly created `institutionId` from step 1 as a prop to `BrandForm` in step 2.

### B. Standalone edit page — `/brand-settings`

Used for post-onboarding edits. Both `super_admin` and `institution_admin` can reach this page.

```tsx
// sms-system/src/scenes/(dashboard)/brand-settings/index.tsx (new file)
```

**Route (App.tsx):**

```tsx
import BrandSettingsPage from '@/scenes/(dashboard)/brand-settings';

<Route
  path="/brand-settings"
  element={
    (role === 'super_admin' || role === 'institution_admin')
      ? <BrandSettingsPage />
      : <Navigate to="/" replace />
  }
/>
```

**`institutionId` resolution inside `BrandSettingsPage`:**

```typescript
// institution_admin — use their own institutionId from auth context
// super_admin — read from ?institutionId= query param (set by linking page)
const { role, institutionId: authInstitutionId } = useAuth();
const [searchParams] = useSearchParams();

const targetInstitutionId =
  role === 'super_admin'
    ? searchParams.get('institutionId')
    : authInstitutionId;
```

If `super_admin` navigates to `/brand-settings` without a query param, show an error or redirect.

**Navigation links to `/brand-settings`:**

- `institution_admin` dashboard: add a "Brand Settings" quick action or a link in the sidebar settings section.
- `super_admin` institution list (future): each row links to `/brand-settings?institutionId={id}`.

### Files affected

- `sms-system/src/scenes/(dashboard)/brand-settings/index.tsx` (new file)
- `sms-system/src/scenes/(dashboard)/super-admin/onboard-institution/index.tsx` — add wizard step 2
- `sms-system/src/App.tsx` — add `/brand-settings` route

---

## 8. Role and Access Matrix

| Role | Read brand data | Edit brand data | Which institutions |
|---|---|---|---|
| `super_admin` | Yes (via institution list) | Yes | Any |
| `institution_admin` | Yes (own institution) | Yes | Own institution only |
| `senior_teacher` | Implicit (brand color applied at login) | No | Own institution (read-only, via AuthContext) |
| `regular_teacher` | Implicit | No | Own institution (read-only, via AuthContext) |
| `student` | Implicit | No | Own institution (read-only, via AuthContext) |
| `parent` | Implicit | No | Own institution (read-only, via AuthContext) |

"Implicit" means the brand color is applied automatically via `BrandApplicator` — the user never sees or interacts with brand data directly.

---

## 9. Full File Change Summary

| File | Change type | Description |
|---|---|---|
| `sms-system/src/lib/AuthContext.tsx` | Modify | Add `InstitutionBrand` type; add `institution` to context value; fetch institution doc on login |
| `sms-system/src/components/BrandApplicator.tsx` | New | Sets `--brand-accent` CSS custom property from auth context |
| `sms-system/src/components/forms/BrandForm.tsx` | New | Shared brand data form — text fields, color picker, image uploads |
| `sms-system/src/scenes/(dashboard)/index.tsx` | Modify | Mount `<BrandApplicator />` |
| `sms-system/src/scenes/(dashboard)/super-admin/onboard-institution/index.tsx` | Modify | Add "Brand & Profile" as step 2 of the wizard using `BrandForm` |
| `sms-system/src/scenes/(dashboard)/brand-settings/index.tsx` | New | Standalone brand edit page for `institution_admin` + `super_admin` |
| `sms-system/src/App.tsx` | Modify | Add `/brand-settings` route |
| `tailwind.config.js` | Modify | Change `lamaSky` and `lamaSkyLight` to `color-mix()` expressions |
| `sms-system/src/index.css` | Modify | Add `--brand-accent` CSS custom property default to `:root` |
| Firebase Console — Storage rules | External | Add institution file write rule (see section 2) |
| Firebase Console — Firestore rules | External | Allow `institution_admin` to update own institution doc (see section 3) |

---

## 10. Open Items and Deferred Work

### Dark mode brand color

The current dark mode accent variants (e.g. `dark:bg-sky-900/40`) use hardcoded Tailwind classes and are not overridden by `--brand-accent`. Extending the brand color to dark mode requires:

1. A second CSS custom property: `--brand-accent-dark`
2. Separate `color-mix()` expressions mixing with black (e.g. `color-mix(in srgb, var(--brand-accent-dark) 40%, black)`)
3. Updating all `dark:bg-sky-*` usages to reference the new derived dark values

This is deferred until dark mode theming is formally in scope.

### Full palette replacement

The current palette uses three accent colors: sky-blue (`lamaSky`), yellow (`lamaYellow`), and purple (`lamaPurple`). This spec replaces sky-blue only. If full palette replacement is ever required, the same `color-mix()` pattern can be extended:

```css
:root {
  --brand-accent:           #7CC2EC; /* replaces lamaSky */
  --brand-accent-secondary: #FAE27C; /* replaces lamaYellow */
  --brand-accent-tertiary:  #CFCEFF; /* replaces lamaPurple */
}
```

### Image size guidance

No client-side image compression is implemented in this spec. The `BrandForm` should display a UI note recommending images under 500 KB. Firebase Storage enforces no size limit by default — a Storage rule condition (`request.resource.size < 1 * 1024 * 1024`) can enforce a 1 MB cap if desired.

### `super_admin` navigation to per-institution brand settings

The `/brand-settings?institutionId=` route for `super_admin` requires a linking surface (an institution list or detail page) that does not yet exist. Until that page is built, a `super_admin` can navigate to `/brand-settings?institutionId=<id>` manually or via browser URL bar. Building the institution list page is a separate future item.

### Existing `institutions` documents without brand fields

All current institution documents were created before this spec and have none of the brand fields. This is safe — all fields are optional and the UI falls back gracefully. No migration is needed.
