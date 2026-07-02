# Brand Data Architecture Specification

> **Purpose:** Authoritative reference for the institution brand data feature. Records every design decision, justification, trade-off, code template, Firebase rule, and implementation detail. Read this before implementing any part of this feature.
>
> **Date documented:** 2026-06-13
> **Last updated:** 2026-06-13 (image storage switched from Firebase Storage to Firestore base64; Section 2 replaced with client-side image processing spec; size cap raised to 2 MB)
> **Branch:** `post-mvp-additions`
> **Status:** Spec only — not yet implemented.

---

## Feature Summary

A `super_admin` can input brand data for any institution during onboarding or at any time thereafter. An `institution_admin` can view and edit their own institution's brand data. Brand data is stored on the existing `institutions/{id}` Firestore document; the institution image is encoded as a base64 data URI and stored directly in that same Firestore document (client-side compressed and resized before encoding — no Firebase Storage bucket is used). The institution's brand color is applied as the accent color across the dashboard for all users tied to that institution. The institution image appears in the sidebar header, on a dedicated institution profile page, and as a card on the `institution_admin` dashboard.

---

## Design Decisions (Q&A)

| Question | Answer |
|---|---|
| How are institution images stored? | Base64 data URI stored directly in Firestore; image is resized and compressed client-side before encoding (no Firebase Storage bucket). |
| Logo vs. coat of arms — one field or two? | One field (`logoUrl`). Academic institutions typically use a single image that serves as both logo and institutional crest. Two separate upload fields add complexity without practical benefit. |
| What is the scope of brand color application? | Accent color only — replaces the sky-blue accent throughout the UI |
| Where does `super_admin` enter brand data? | New step in the existing `/onboard-institution` wizard; editable post-onboarding via `/brand-settings` |
| Can `institution_admin` edit their own brand data? | Yes — view and edit |
| Where is the institution image displayed? | Sidebar header (all non-`super_admin` roles); `/institution-profile` page (roles below `institution_admin`); `institution_admin` dashboard card |

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
  motto?: string;      // institution motto or tagline
  phone?: string;      // contact phone number
  email?: string;      // contact email address
  address?: string;    // physical address
  brandColor?: string; // hex string e.g. "#1e40af"
  logoUrl?: string;    // Base64 data URI (data:image/...;base64,...) stored directly in this document
}
```

### Notes

- All new fields are optional. An institution document without brand fields is valid — the UI falls back to the default theme and shows no logo.
- `brandColor` stores the raw hex string as entered by the user (e.g. `"#1e40af"`). No normalisation to uppercase or shorthand is performed.
- `logoUrl` stores a **base64 data URI** string (e.g. `data:image/jpeg;base64,...`). The image is resized client-side to a maximum of 512×512 pixels before encoding. A base64-encoded JPEG at that size is typically 40–110 KB — well within Firestore's 1 MiB per-document limit. PNG output (for transparent logos) is slightly larger but still comfortably within the limit.
- The field is named `logoUrl` to be consistent with the pre-existing naming convention in this codebase. It serves as both logo and coat of arms — academic institutions typically use a single image for both purposes.

---

## 2. Image Processing

Institution images are processed entirely client-side before being stored. No Firebase Storage bucket is used — the encoded image is written directly to the `institutions/{id}` Firestore document as the `logoUrl` string.

### Input validation

The file input's `onChange` handler rejects files over **2 MB** before any processing begins. An inline error message is shown and the file is cleared. The 2 MB limit applies to the raw input file; the encoded output is substantially smaller after resizing.

### Client-side processing pipeline

For accepted files:

1. Load the `File` into an `HTMLImageElement` via `URL.createObjectURL`
2. Draw the image onto a `<canvas>` scaled to a maximum of **512×512 pixels** (aspect-ratio-preserving; images smaller than 512 px on either axis are not upscaled)
3. Revoke the object URL immediately after the canvas draw to free memory
4. Export via `canvas.toDataURL()` with format detection:
   - **PNG input** → output `image/png` (preserves transparency for logos with transparent backgrounds)
   - **All other input** (JPEG, WebP, etc.) → output `image/jpeg` at quality `0.82`
5. Store the resulting base64 data URI string as `logoUrl` in Firestore via `setDoc(..., { merge: true })`

### Expected output sizes

| Input | Output format | Approx. base64 size |
| --- | --- | --- |
| Logo PNG with transparency (512×512 after resize) | `image/png` | 30–150 KB |
| Photo-style JPEG (512×512 after resize) | `image/jpeg` q=0.82 | 40–110 KB |

Both are well within Firestore's 1 MiB per-document limit.

### Preview

The same `URL.createObjectURL` URL (before being revoked) is used as the `<img src>` for the thumbnail preview shown in the form before submit. This is separate from the base64 encoding — the preview renders from the object URL; the storage write uses the base64 URI.

### No server-side enforcement

Because `logoUrl` is stored as a plain string in Firestore, content-type and size restrictions are enforced exclusively on the client. The Firestore security rules governing the `institutions` collection remain unchanged (see Section 3) and already restrict writes to `super_admin` and the institution's own `institution_admin`. A user who crafts a direct Firestore write can store any string as `logoUrl` — this is acceptable for institution logos managed by trusted roles.

### Future image types

This approach is scoped to institution logos — one image per institution stored in the institution document. If student or staff profile photos are added in a future iteration, per-document base64 storage will not scale (many user documents each containing a large base64 string). Profile photos should be evaluated separately and may warrant Firebase Storage, Cloudinary, or another dedicated image host.

---

## 3. Firestore Security Rules

### No changes required

The currently deployed rule for `institutions` already permits `institution_admin` to update their own institution document:

```javascript
// Currently deployed (firebase-rules.md)
match /institutions/{institutionId} {
  allow read: if isSuperAdmin() || myInstitutionId() == institutionId;
  allow create: if isSuperAdmin();
  allow update: if isSuperAdmin()
    || (isAdmin() && myInstitutionId() == institutionId);  // ← already sufficient
  allow delete: if isSuperAdmin();
}
```

The `institution_admin` update permission was added in an earlier iteration (to support the `gradingSystem` field). Saving brand data fields (`motto`, `phone`, `email`, `address`, `brandColor`, `logoUrl`) is an update operation on the same document and is already covered.

### ⚠ Do not deploy the Firestore rule from earlier drafts of this spec

An earlier draft of this spec proposed replacing the `institutions` rule with a version using `allow write` (which covers create + update + delete) and opening `allow read` to all authenticated users. That proposal is a regression on both counts and must not be deployed:

- `allow write` would grant `institution_admin` delete access to their own institution document — an unintended privilege escalation.
- Opening `allow read: if request.auth != null` would let any authenticated user read any institution document, breaking the institution-scoped read restriction.

The existing deployed rule is correct as-is. No Firestore rule change is needed for this feature.

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
  readOnlyName?: boolean;                  // true in the onboarding wizard; name is pre-populated and locked
  onSuccess?: () => void;                  // called after a successful save (e.g. advance wizard step)
  onSkip?: () => void;                     // when provided, a Skip button is rendered alongside Submit
}
```

### Zod schema

```typescript
import { z } from 'zod';

const schema = z.object({
  name:       z.string().min(1, 'Institution name is required.'),
  motto:      z.string().optional(),
  phone:      z.string().optional(),
  email:      z.string().email('Invalid email address.').optional().or(z.literal('')),
  address:    z.string().optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color (e.g. #1e40af).')
    .optional()
    .or(z.literal('')),
});

type BrandFormInputs = z.infer<typeof schema>;
```

The image file is handled outside Zod via a separate `useState` ref (`logoFile: File | null`). File inputs are not easily validated by Zod in react-hook-form.

### Submit flow

```typescript
// Module-level helper — resize and base64-encode the institution image.
// PNG input → PNG output (preserves transparency for logos with transparent backgrounds).
// All other formats → JPEG at quality 0.82.
function processImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 512;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const fmt     = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = fmt === 'image/jpeg' ? 0.82 : undefined;
      resolve(canvas.toDataURL(fmt, quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image.'));
    };
    img.src = objectUrl;
  });
}

const onSubmit = handleSubmit(async (formData) => {
  setSubmitting(true);
  const updates: Partial<InstitutionDocument> = { ...formData };

  // Encode the institution image as a base64 data URI and store directly in Firestore
  if (logoFile) {
    updates.logoUrl = await processImage(logoFile);
  }

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
| Institution image (logo / crest) | `<input type="file" accept="image/*">` + thumbnail preview | Shows current `logoUrl` as thumbnail if set. Serves as both logo and institutional crest. Max 1 MB. |

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

**Image field pattern:**

```tsx
{/* Thumbnail preview of current image */}
{initialData?.logoUrl && !logoFile && (
  <img src={initialData.logoUrl} alt="Current institution image" className="w-16 h-16 object-contain rounded" />
)}
{/* New file preview */}
{logoFile && (
  <img src={URL.createObjectURL(logoFile)} alt="New image preview" className="w-16 h-16 object-contain rounded" />
)}
<input
  type="file"
  accept="image/*"
  onChange={(e) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.size > 2 * 1024 * 1024) {
      setLogoFileError('File exceeds the 2 MB limit. Please choose a smaller image.');
      setLogoFile(null);
      e.target.value = '';
    } else {
      setLogoFileError(null);
      setLogoFile(file);
    }
  }}
  className="text-sm"
/>
{logoFileError && (
  <p className="text-xs text-red-500 mt-1">{logoFileError}</p>
)}
<p className="text-xs text-gray-500 mt-1">PNG or JPEG recommended. Maximum file size: 2 MB — image will be compressed before saving.</p>
```

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

- `institution_admin` dashboard: "Edit →" link on the `InstitutionBrandCard` (see Section 8C).
- `super_admin` institution list (future): each row links to `/brand-settings?institutionId={id}`.

---

## 8. UI Display Surfaces

Brand data is displayed in three places beyond the editing form: the sidebar header (for all non-`super_admin` roles), a read-only institution profile page (for roles below `institution_admin`), and a summary card on the `institution_admin` dashboard.

---

### 8A. Sidebar institution logo

**Who sees it:** All non-`super_admin` roles — `institution_admin`, `senior_teacher`, `regular_teacher`, `student`, `parent`.

**Where:** The sidebar header area, above the navigation links. The institution image is displayed alongside the institution name.

**Layout:**

```tsx
{/* Sidebar header — institution identity area */}
{institution?.logoUrl ? (
  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
    <img
      src={institution.logoUrl}
      alt={institution.name}
      className="w-10 h-10 object-contain rounded shrink-0"
    />
    <span className="text-sm font-semibold text-gray-800 dark:text-white truncate">
      {institution.name}
    </span>
  </div>
) : (
  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
    <span className="text-sm font-semibold text-gray-800 dark:text-white">
      {institution?.name ?? ''}
    </span>
  </div>
)}
```

**Behaviour:**

- If `institution.logoUrl` is set: show the image (40×40 px, `object-contain`) to the left of the institution name.
- If `institution.logoUrl` is not set: show the institution name text only — no broken image placeholder.
- If `institution` is `null` (`super_admin`): this slot is not rendered; existing app branding is preserved.

**File:** The sidebar/menu component (locate via `sms-system/src/scenes/(dashboard)/index.tsx` — whichever component renders the sidebar inside `DashboardLayout`). Confirm the exact file path during implementation.

---

### 8B. Institution profile page — `/institution-profile`

A read-only page displaying the institution's brand data for roles that cannot edit it.

**Who sees it:** `senior_teacher`, `regular_teacher`, `student`, `parent`.

**Who does not:**

- `institution_admin` — redirected to `/` (their dashboard has the brand card; `/brand-settings` is their edit surface).
- `super_admin` — redirected to `/` (no single institution).

**Route (App.tsx):**

```tsx
import InstitutionProfilePage from '@/scenes/(dashboard)/institution-profile';

<Route
  path="/institution-profile"
  element={
    ['senior_teacher', 'regular_teacher', 'student', 'parent'].includes(role ?? '')
      ? <InstitutionProfilePage />
      : <Navigate to="/" replace />
  }
/>
```

**Data source:** `useAuth().institution` — already loaded into context at login. No additional Firestore fetch is required on this page.

**Page layout:**

```tsx
// sms-system/src/scenes/(dashboard)/institution-profile/index.tsx
const InstitutionProfilePage = () => {
  const { institution } = useAuth();

  if (!institution) return null;

  return (
    <div className="max-w-xl mx-auto p-6 flex flex-col items-center gap-6">

      {/* Institution image — displayed prominently at the top */}
      {institution.logoUrl && (
        <img
          src={institution.logoUrl}
          alt={institution.name}
          className="w-40 h-40 object-contain rounded-lg shadow-sm"
        />
      )}

      {/* Name and motto */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{institution.name}</h1>
        {institution.motto && (
          <p className="mt-1 text-sm italic text-gray-500 dark:text-gray-400">{institution.motto}</p>
        )}
      </div>

      {/* Contact details */}
      <div className="w-full bg-white dark:bg-gray-800 rounded-md p-4 flex flex-col gap-2 text-sm">
        {institution.phone && (
          <div className="flex items-start gap-2">
            <span className="text-gray-500 w-20 shrink-0">Phone</span>
            <span className="text-gray-800 dark:text-gray-200">{institution.phone}</span>
          </div>
        )}
        {institution.email && (
          <div className="flex items-start gap-2">
            <span className="text-gray-500 w-20 shrink-0">Email</span>
            <a href={`mailto:${institution.email}`} className="text-sky-600 hover:underline">
              {institution.email}
            </a>
          </div>
        )}
        {institution.address && (
          <div className="flex items-start gap-2">
            <span className="text-gray-500 w-20 shrink-0">Address</span>
            <span className="text-gray-800 dark:text-gray-200 whitespace-pre-line">{institution.address}</span>
          </div>
        )}
        {!institution.phone && !institution.email && !institution.address && (
          <p className="text-gray-400 text-xs italic">No contact details on record.</p>
        )}
      </div>
    </div>
  );
};
```

**Sidebar nav link:** Add a link to `/institution-profile` in the navigation for `senior_teacher`, `regular_teacher`, `student`, and `parent` roles. Suggested label: the institution name, or "School Info" as a fallback. Exact placement within each role's menu items must be confirmed against the current sidebar menu structure during implementation.

---

### 8C. `institution_admin` dashboard brand card

A summary card on the `institution_admin` homepage (`AdminPage`) displaying key brand data and linking to the edit page.

**Who sees it:** `institution_admin` only (AdminPage is already role-gated).

**Placement in AdminPage:** Added to the existing right rail (`col-span-12 lg:col-span-4 flex flex-col gap-4`), below `<Announcements />`, as the third stacked item.

**Component:** `sms-system/src/components/InstitutionBrandCard.tsx`

```tsx
// sms-system/src/components/InstitutionBrandCard.tsx
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export function InstitutionBrandCard() {
  const { institution } = useAuth();

  if (!institution) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Institution Profile</h2>
        <Link
          to="/brand-settings"
          className="text-xs text-sky-600 hover:underline dark:text-sky-400"
        >
          Edit →
        </Link>
      </div>

      {/* Institution image — displayed prominently */}
      {institution.logoUrl && (
        <div className="flex justify-center py-2">
          <img
            src={institution.logoUrl}
            alt={institution.name}
            className="w-24 h-24 object-contain rounded-lg"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5 text-sm">
        <p className="font-semibold text-gray-900 dark:text-white">{institution.name}</p>
        {institution.motto && (
          <p className="text-xs italic text-gray-500 dark:text-gray-400">{institution.motto}</p>
        )}
        {institution.phone && (
          <p className="text-xs text-gray-600 dark:text-gray-400">{institution.phone}</p>
        )}
        {institution.email && (
          <a href={`mailto:${institution.email}`} className="text-xs text-sky-600 hover:underline dark:text-sky-400">
            {institution.email}
          </a>
        )}
        {institution.address && (
          <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-line">{institution.address}</p>
        )}
        {!institution.logoUrl && !institution.motto && !institution.phone && !institution.email && !institution.address && (
          <p className="text-xs text-gray-400 italic">
            No brand data set.{' '}
            <Link to="/brand-settings" className="text-sky-600 hover:underline">Add it now →</Link>
          </p>
        )}
      </div>
    </div>
  );
}
```

**AdminPage change:**

```tsx
// sms-system/src/scenes/(dashboard)/admin/index.tsx
import { InstitutionBrandCard } from "@/components/InstitutionBrandCard";

// In the right rail (below <Announcements />):
<div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
  <EventCalendar />
  <Announcements />
  <InstitutionBrandCard />   {/* ← new */}
</div>
```

---

## 9. Role and Access Matrix

| Role | Read brand data | Edit brand data | Sidebar logo | Profile page | Dashboard card |
| --- | --- | --- | --- | --- | --- |
| `super_admin` | Yes (via institution list) | Yes (any institution) | No | No | No |
| `institution_admin` | Yes (own institution) | Yes (own institution) | Yes | No — has dashboard card + `/brand-settings` | Yes |
| `senior_teacher` | Implicit + `/institution-profile` | No | Yes | Yes | No |
| `regular_teacher` | Implicit + `/institution-profile` | No | Yes | Yes | No |
| `student` | Implicit + `/institution-profile` | No | Yes | Yes | No |
| `parent` | Implicit + `/institution-profile` | No | Yes | Yes | No |

"Implicit" means the brand color is applied automatically via `BrandApplicator` — the user never sees or interacts with brand data directly unless they visit `/institution-profile`.

---

## 10. Full File Change Summary

| File | Change type | Description |
|---|---|---|
| `sms-system/src/lib/firebase.ts` | Modify | Extend `InstitutionDocument` type with brand fields (`motto`, `phone`, `email`, `address`, `brandColor`, `logoUrl`) — no Storage initialization needed |
| `sms-system/src/lib/AuthContext.tsx` | Modify | Add `InstitutionBrand` type; add `institution` to context value; fetch institution doc on login |
| `sms-system/src/components/BrandApplicator.tsx` | New | Sets `--brand-accent` CSS custom property from auth context |
| `sms-system/src/components/forms/BrandForm.tsx` | New | Shared brand data form — text fields, color picker, single image upload |
| `sms-system/src/components/InstitutionBrandCard.tsx` | New | Read-only brand summary card for the `institution_admin` dashboard |
| `sms-system/src/scenes/(dashboard)/index.tsx` | Modify | Mount `<BrandApplicator />`; add institution logo to sidebar header |
| `sms-system/src/scenes/(dashboard)/admin/index.tsx` | Modify | Add `<InstitutionBrandCard />` to the right rail below `<Announcements />` |
| `sms-system/src/scenes/(dashboard)/super-admin/onboard-institution/index.tsx` | Modify | Add "Brand & Profile" as step 2 of the wizard using `BrandForm` |
| `sms-system/src/scenes/(dashboard)/brand-settings/index.tsx` | New | Standalone brand edit page for `institution_admin` + `super_admin` |
| `sms-system/src/scenes/(dashboard)/institution-profile/index.tsx` | New | Read-only institution info page for `senior_teacher`, `regular_teacher`, `student`, `parent` |
| `sms-system/src/App.tsx` | Modify | Add `/brand-settings` and `/institution-profile` routes |
| `tailwind.config.js` | Modify | Change `lamaSky` and `lamaSkyLight` to `color-mix()` expressions |
| `sms-system/src/index.css` | Modify | Add `--brand-accent` CSS custom property default to `:root` |
| Firebase Console — Firestore rules | External | No changes required (see Section 3) |

---

## 11. Open Items and Deferred Work

### Dark mode brand color

The current dark mode variants (e.g. `dark:bg-sky-900/40`) use hardcoded Tailwind classes and are not overridden by `--brand-accent`. Extending the brand color to dark mode requires:

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

### `super_admin` navigation to per-institution brand settings

The `/brand-settings?institutionId=` route for `super_admin` requires a linking surface (an institution list or detail page) that does not yet exist. Until that page is built, a `super_admin` can navigate to `/brand-settings?institutionId=<id>` manually via the browser URL bar. Building the institution management list is a separate future item.

### Sidebar component file path

The sidebar logo (Section 8A) requires modifying the sidebar/menu component. The exact file path must be confirmed by reading `sms-system/src/scenes/(dashboard)/index.tsx` during implementation to identify which component renders the sidebar inside `DashboardLayout`.

### `/institution-profile` sidebar nav link placement

The read-only institution profile page (Section 8B) requires a sidebar nav link for `senior_teacher`, `regular_teacher`, `student`, and `parent`. The exact position within each role's menu items must be confirmed against the current sidebar menu structure during implementation.

### Existing `institutions` documents without brand fields

All current institution documents were created before this spec and have none of the brand fields. This is safe — all fields are optional and the UI falls back gracefully. No data migration is needed.

### Brand color on display surfaces

The brand accent color is applied globally via `BrandApplicator` and CSS custom properties. `InstitutionProfilePage` and `InstitutionBrandCard` do not need to read `brandColor` directly — the accent already propagates through `lamaSky`/`lamaSkyLight` Tailwind classes. No special color handling is needed in those components.
