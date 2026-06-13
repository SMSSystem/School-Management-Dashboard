# Brand Data — Implementation Plan

> **Spec:** `sms-system/docs/BRAND_DATA_SPEC.md`
> **Branch:** `post-mvp-additions`
> **Date:** 2026-06-13
> **Status:** Ready to implement.

Read the spec before implementing. This document provides the step-by-step execution order, exact code changes, and insertion points derived from reading the current codebase. The spec covers the *why*; this plan covers the *how*.

---

## Dependency Graph

Implement steps in order. A step must not be started until every step it depends on is complete.

```
Step 1  firebase.ts ─────────────────────────────────────────────┐
Step 2  tailwind.config.js + index.css                           │
Step 3  AuthContext.tsx (depends on Step 1)                      │
Step 4  BrandApplicator.tsx (depends on Step 3)                  │
Step 5  BrandForm.tsx (depends on Steps 1, 3)                    │
Step 6  InstitutionBrandCard.tsx (depends on Step 3)             │
Step 7  DashboardLayout index.tsx (depends on Steps 3, 4)        │
Step 8  AdminPage index.tsx (depends on Step 6)                  │
Step 9  brand-settings/index.tsx (depends on Step 5)             │
Step 10 institution-profile/index.tsx (depends on Step 3)        │
Step 11 onboard-institution/index.tsx (depends on Step 5)        │
Step 12 App.tsx (depends on Steps 9, 10)                         │
Step 13 Menu.tsx (no upstream deps)                              │
Step 14 Firebase Storage rules — deploy via Firebase Console ────┘
```

---

## Step 1 — `firebase.ts`: Storage export + brand fields on `InstitutionDocument`

**File:** `sms-system/src/lib/firebase.ts`

### 1a. Add `getStorage` import and export

Add to line 3 (alongside existing firebase imports):

```typescript
import { getStorage } from 'firebase/storage';
```

Add after line 19 (`export const db = ...`):

```typescript
export const storage = getStorage(app);
```

### 1b. Extend `InstitutionDocument`

The existing type (lines 155–166) is missing brand fields. Replace it:

```typescript
export type InstitutionDocument = {
  name: string;
  institutionId: string;
  createdAt: Timestamp | string;
  status: 'active' | 'suspended';
  gradingSystem?: GradingSystem;
  location?: string;
  userCount?: number;
  studentCount?: number;
  teacherCount?: number;
  lastActiveAt?: string;
  // Brand fields — all optional; legacy documents without them are valid
  motto?: string;
  phone?: string;
  email?: string;
  address?: string;
  brandColor?: string;
  logoUrl?: string;
};
```

---

## Step 2 — CSS Foundation

### 2a. `tailwind.config.js`

**File:** `sms-system/tailwind.config.js`

Replace the two sky color values (lines 10–11). The yellow and purple values stay unchanged.

```javascript
// Before
lamaSky:      "#C3EBFA",
lamaSkyLight: "#EDF9FD",

// After
lamaSky:      "color-mix(in srgb, var(--brand-accent) 30%, white)",
lamaSkyLight: "color-mix(in srgb, var(--brand-accent) 10%, white)",
```

Tailwind emits these strings literally into the generated CSS. Browsers resolve `color-mix()` and `var(--brand-accent)` at paint time. No build-time computation is needed.

**Regression check:** after this change, `bg-lamaSky` and `bg-lamaSkyLight` will visually match their previous hex values as long as `--brand-accent` defaults to `#7CC2EC` (set in Step 2b). Verify the sidebar active state and hover colors are unchanged for super_admin (who has no brand color set).

### 2b. `src/index.css`

**File:** `sms-system/src/index.css`

Insert a `:root` block before the existing `body` rule (line 5):

```css
:root {
  --brand-accent: #7CC2EC; /* default sky-blue — matches current lamaSky source color */
}
```

`BrandApplicator` (Step 4) sets this property at runtime when a brand color exists. When it removes the property (no brand color), the browser falls back to this default, preserving the existing appearance.

---

## Step 3 — `AuthContext.tsx`: institution state

**File:** `sms-system/src/lib/AuthContext.tsx`

### 3a. Add `InstitutionBrand` type and extend `AuthContextValue`

Insert after line 4 (the `import { auth, db, Role } from './firebase';` line):

```typescript
export interface InstitutionBrand {
  name: string;
  motto?: string;
  phone?: string;
  email?: string;
  address?: string;
  brandColor?: string;
  logoUrl?: string;
}
```

Add `institution` to the `AuthContextValue` interface (after `institutionId`):

```typescript
institution: InstitutionBrand | null;
```

### 3b. Add `institution` state variable

In `AuthProvider`, after line 39 (`const [classId, setClassId] = useState<string | null>(null);`):

```typescript
const [institution, setInstitution] = useState<InstitutionBrand | null>(null);
```

### 3c. Reset `institution` on sign-out

In the `else` branch of `onAuthStateChanged` (the sign-out path, around line 47–59), add:

```typescript
setInstitution(null);
```

### 3d. Fetch institution data in `fetchRole`

In `fetchRole`, after line 86 (`setClassId(...)`) and before line 88 (`const fetchedInstitutionId = ...`), insert:

```typescript
// Fetch institution brand data for non-super_admin users
if (fetchedRole !== 'super_admin') {
  const instId = (data?.institutionId as string) ?? '';
  if (instId) {
    try {
      const instSnap = await getDoc(doc(db, 'institutions', instId));
      if (instSnap.exists()) {
        const d = instSnap.data();
        setInstitution({
          name:       (d.name       as string) ?? '',
          motto:      d.motto       as string | undefined,
          phone:      d.phone       as string | undefined,
          email:      d.email       as string | undefined,
          address:    d.address     as string | undefined,
          brandColor: d.brandColor  as string | undefined,
          logoUrl:    d.logoUrl     as string | undefined,
        });
      } else {
        setInstitution(null);
      }
    } catch {
      setInstitution(null); // non-fatal; brand data is display-only
    }
  }
} else {
  setInstitution(null); // super_admin has no single institution
}
```

### 3e. Expose `institution` in the Provider value

Update the `<AuthContext.Provider value={...}>` call (line 147) to include `institution`:

```typescript
<AuthContext.Provider value={{
  user, role, institutionId, institution,
  displayName, phone, address, userStatus, department,
  emergencyContact, linkedAccounts, classId,
  loading, signIn, signOut, refreshProfile
}}>
```

### 3f. Refresh institution in `refreshProfile` (optional but recommended)

`refreshProfile` currently refreshes user fields only. Add institution refresh at the end of the `try` block in `refreshProfile` (after line 127):

```typescript
// Refresh institution data alongside user profile
if (role && role !== 'super_admin') {
  const instId = (data?.institutionId as string) ?? '';
  if (instId) {
    try {
      const instSnap = await getDoc(doc(db, 'institutions', instId));
      if (instSnap.exists()) {
        const d = instSnap.data();
        setInstitution({
          name:       (d.name       as string) ?? '',
          motto:      d.motto       as string | undefined,
          phone:      d.phone       as string | undefined,
          email:      d.email       as string | undefined,
          address:    d.address     as string | undefined,
          brandColor: d.brandColor  as string | undefined,
          logoUrl:    d.logoUrl     as string | undefined,
        });
      }
    } catch {
      // non-fatal
    }
  }
}
```

---

## Step 4 — `BrandApplicator.tsx` (new file)

**File:** `sms-system/src/components/BrandApplicator.tsx`

Create the file with the following content:

```tsx
import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';

export function BrandApplicator() {
  const { institution } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    if (institution?.brandColor) {
      root.style.setProperty('--brand-accent', institution.brandColor);
    } else {
      root.style.removeProperty('--brand-accent');
    }
  }, [institution?.brandColor]);

  return null;
}
```

---

## Step 5 — `BrandForm.tsx` (new file)

**File:** `sms-system/src/components/forms/BrandForm.tsx`

This form is used in both the onboarding wizard (where `name` is read-only and a Skip button is shown) and the standalone `/brand-settings` page (where `name` is editable and there is no Skip button).

```tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import type { InstitutionBrand } from '@/lib/AuthContext';

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

interface BrandFormProps {
  institutionId: string;
  initialData?: Partial<InstitutionBrand>;
  readOnlyName?: boolean;   // true in the onboarding wizard; name is pre-populated and locked
  onSuccess?: () => void;
  onSkip?: () => void;      // when provided, a Skip button is rendered alongside Submit
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-red-500">{message}</p>;
}

export default function BrandForm({
  institutionId,
  initialData,
  readOnlyName = false,
  onSuccess,
  onSkip,
}: BrandFormProps) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<BrandFormInputs>({
    resolver: zodResolver(schema),
    defaultValues: {
      name:       initialData?.name       ?? '',
      motto:      initialData?.motto      ?? '',
      phone:      initialData?.phone      ?? '',
      email:      initialData?.email      ?? '',
      address:    initialData?.address    ?? '',
      brandColor: initialData?.brandColor ?? '',
    },
  });

  const onSubmit = handleSubmit(async (formData) => {
    setError(null);
    setSubmitting(true);
    try {
      const updates: Record<string, unknown> = { ...formData };

      if (logoFile) {
        const logoRef = ref(storage, `institutions/${institutionId}/logo`);
        const snapshot = await uploadBytes(logoRef, logoFile);
        updates.logoUrl = await getDownloadURL(snapshot.ref);
      }

      await setDoc(doc(db, 'institutions', institutionId), updates, { merge: true });
      onSuccess?.();
    } catch {
      setError('Failed to save brand data. Please try again.');
    } finally {
      setSubmitting(false);
    }
  });

  const inputClass =
    'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
  const disabledClass =
    'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 dark:disabled:text-gray-400';
  const labelClass = 'flex flex-col gap-2 text-sm font-medium text-gray-700 dark:text-gray-200';

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4 sm:p-6"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Brand &amp; Profile</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          All fields except the institution name are optional.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">

        <label className={labelClass}>
          Institution name
          <input
            {...register('name')}
            disabled={readOnlyName}
            aria-invalid={Boolean(errors.name)}
            className={readOnlyName ? disabledClass : inputClass}
          />
          <FieldError message={errors.name?.message} />
        </label>

        <label className={labelClass}>
          Motto <span className="font-normal text-gray-400">(optional)</span>
          <input {...register('motto')} className={inputClass} />
        </label>

        <label className={labelClass}>
          Phone <span className="font-normal text-gray-400">(optional)</span>
          <input {...register('phone')} type="tel" className={inputClass} />
        </label>

        <label className={labelClass}>
          Email <span className="font-normal text-gray-400">(optional)</span>
          <input {...register('email')} type="email" aria-invalid={Boolean(errors.email)} className={inputClass} />
          <FieldError message={errors.email?.message} />
        </label>

        <label className={`${labelClass} md:col-span-2`}>
          Address <span className="font-normal text-gray-400">(optional)</span>
          <textarea {...register('address')} rows={3} className={`${inputClass} resize-none`} />
        </label>

        <label className={labelClass}>
          Brand color <span className="font-normal text-gray-400">(optional)</span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={watch('brandColor') || '#7CC2EC'}
              onChange={(e) => setValue('brandColor', e.target.value, { shouldValidate: true })}
              className="w-10 h-10 rounded cursor-pointer border border-gray-300 dark:border-gray-700"
            />
            <input
              {...register('brandColor')}
              type="text"
              placeholder="#1e40af"
              aria-invalid={Boolean(errors.brandColor)}
              className={`${inputClass} w-32`}
            />
          </div>
          <FieldError message={errors.brandColor?.message} />
          <p className="text-xs text-gray-400">
            For best results, choose a mid-range or light color. Very dark colors may reduce text readability.
          </p>
        </label>

        <label className={labelClass}>
          Institution image <span className="font-normal text-gray-400">(optional — logo / crest)</span>
          <div className="flex flex-col gap-2">
            {initialData?.logoUrl && !logoFile && (
              <img
                src={initialData.logoUrl}
                alt="Current institution image"
                className="w-16 h-16 object-contain rounded border border-gray-200 dark:border-gray-700"
              />
            )}
            {logoFile && (
              <img
                src={URL.createObjectURL(logoFile)}
                alt="New image preview"
                className="w-16 h-16 object-contain rounded border border-gray-200 dark:border-gray-700"
              />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="text-sm text-gray-600 dark:text-gray-300"
            />
            <p className="text-xs text-gray-400">PNG or JPEG recommended. Maximum file size: 1 MB.</p>
          </div>
        </label>

      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300"
        >
          {submitting ? 'Saving…' : 'Save'}
        </button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Skip
          </button>
        )}
      </div>
    </form>
  );
}
```

---

## Step 6 — `InstitutionBrandCard.tsx` (new file)

**File:** `sms-system/src/components/InstitutionBrandCard.tsx`

Per spec Section 8C — no changes needed from the spec template. Create the file:

```tsx
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

export function InstitutionBrandCard() {
  const { institution } = useAuth();

  if (!institution) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Institution Profile</h2>
        <Link to="/brand-settings" className="text-xs text-sky-600 hover:underline dark:text-sky-400">
          Edit →
        </Link>
      </div>

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
          <a
            href={`mailto:${institution.email}`}
            className="text-xs text-sky-600 hover:underline dark:text-sky-400"
          >
            {institution.email}
          </a>
        )}
        {institution.address && (
          <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-line">
            {institution.address}
          </p>
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

---

## Step 7 — `DashboardLayout` (`scenes/(dashboard)/index.tsx`)

**File:** `sms-system/src/scenes/(dashboard)/index.tsx`

Two changes: mount `BrandApplicator`, and replace the hardcoded sidebar header with a role-aware institution identity block.

### 7a. Updated imports

```tsx
import Menu from "@/components/Menu";
import Navbar from "@/components/Navbar";
import { Link } from "react-router-dom";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { BrandApplicator } from "@/components/BrandApplicator";
import { useAuth } from "@/lib/AuthContext";
```

### 7b. Updated component

```tsx
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useInactivityLogout();
  const { role, institution } = useAuth();

  const showInstitutionHeader = role !== 'super_admin' && institution !== null;

  return (
    <>
      <BrandApplicator />
      <div className="h-dvh flex dark:text-gray-100 bg-[#F7F8FA] dark:bg-gray-900">
        {/* LEFT */}
        <div className="w-20 flex-none p-4 bg-white dark:bg-gray-950 overflow-y-auto lg:w-64 xl:w-72">
          {showInstitutionHeader ? (
            <Link
              to="/"
              className="flex items-center justify-center lg:justify-start gap-2 mb-2 pb-3 border-b border-gray-200 dark:border-gray-700"
            >
              {institution.logoUrl ? (
                <img
                  src={institution.logoUrl}
                  alt={institution.name}
                  className="w-10 h-10 object-contain rounded shrink-0"
                />
              ) : (
                <img src="/logo.png" alt="logo" width={32} height={32} />
              )}
              <span className="hidden lg:block text-sm font-semibold text-gray-800 dark:text-white truncate">
                {institution.name}
              </span>
            </Link>
          ) : (
            <Link
              to="/"
              className="flex items-center justify-center lg:justify-start gap-2"
            >
              <img src="/logo.png" alt="logo" width={32} height={32} />
              <span className="hidden lg:block font-bold">School</span>
            </Link>
          )}
          <Menu />
        </div>
        {/* RIGHT */}
        <div className="min-w-0 flex-1 bg-[#F7F8FA] dark:bg-gray-900 overflow-auto flex flex-col">
          <Navbar />
          {children}
        </div>
      </div>
    </>
  );
}
```

**Note on sidebar icon-only mode:** At widths below `lg` (below 1024 px), the sidebar collapses to 80 px wide and only the icon is visible — text spans with `hidden lg:block` are invisible. For `institution_admin` / teacher / student / parent, if a `logoUrl` is set, the 40×40 institution image acts as the icon. If no `logoUrl` is set, `/logo.png` falls back as the icon. The institution name text is only visible at `lg` and above.

---

## Step 8 — `AdminPage` (`scenes/(dashboard)/admin/index.tsx`)

**File:** `sms-system/src/scenes/(dashboard)/admin/index.tsx`

Add one import and one JSX element.

### 8a. Import

Add alongside existing component imports at the top:

```tsx
import { InstitutionBrandCard } from "@/components/InstitutionBrandCard";
```

### 8b. Right rail insertion

The right rail `div` currently ends with `<Announcements />`. Add `<InstitutionBrandCard />` as the third stacked item:

```tsx
<div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
  <EventCalendar />
  <Announcements />
  <InstitutionBrandCard />
</div>
```

---

## Step 9 — `brand-settings/index.tsx` (new file)

**File:** `sms-system/src/scenes/(dashboard)/brand-settings/index.tsx`

Create the directory `brand-settings/` under `scenes/(dashboard)/`. Create `index.tsx`:

```tsx
import { useSearchParams, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import BrandForm from '@/components/forms/BrandForm';
import type { InstitutionBrand } from '@/lib/AuthContext';

const BrandSettingsPage = () => {
  const { role, institutionId: authInstitutionId, institution: authInstitution } = useAuth();
  const [searchParams] = useSearchParams();

  // super_admin resolves institutionId from query param; institution_admin uses their own
  const targetId =
    role === 'super_admin'
      ? searchParams.get('institutionId')
      : authInstitutionId;

  const [initialData, setInitialData] = useState<Partial<InstitutionBrand> | undefined>(
    role === 'institution_admin' ? (authInstitution ?? undefined) : undefined
  );
  const [loadError, setLoadError] = useState(false);

  // super_admin: fetch the target institution's current brand data
  useEffect(() => {
    if (role !== 'super_admin' || !targetId) return;
    getDoc(doc(db, 'institutions', targetId))
      .then((snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setInitialData({
            name:       d.name       as string | undefined,
            motto:      d.motto      as string | undefined,
            phone:      d.phone      as string | undefined,
            email:      d.email      as string | undefined,
            address:    d.address    as string | undefined,
            brandColor: d.brandColor as string | undefined,
            logoUrl:    d.logoUrl    as string | undefined,
          });
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true));
  }, [role, targetId]);

  if (role === 'super_admin' && !targetId) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">
          No institution specified. Navigate here via an institution link or append{' '}
          <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">
            ?institutionId=&lt;id&gt;
          </code>{' '}
          to the URL.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600">Institution not found.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Brand Settings</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Update your institution's brand data. Changes take effect on the next login.
      </p>
      {targetId && (
        <BrandForm
          institutionId={targetId}
          initialData={initialData}
          onSuccess={() => {
            // No redirect — stay on page; a success message could be added here
          }}
        />
      )}
    </div>
  );
};

export default BrandSettingsPage;
```

**Note on "Changes take effect on the next login":** `AuthContext` fetches institution data once on login (`getDoc`, not `onSnapshot`). After saving via `BrandForm`, the page's `initialData` is stale. The simplest UX is to document that a refresh/re-login is needed, which is acceptable per the spec. If live refresh is desired later, call `refreshProfile()` from `useAuth()` after `onSuccess`.

---

## Step 10 — `institution-profile/index.tsx` (new file)

**File:** `sms-system/src/scenes/(dashboard)/institution-profile/index.tsx`

Create the directory `institution-profile/` under `scenes/(dashboard)/`. Create `index.tsx`. Content is per spec Section 8B exactly:

```tsx
import { useAuth } from '@/lib/AuthContext';

const InstitutionProfilePage = () => {
  const { institution } = useAuth();

  if (!institution) return null;

  return (
    <div className="max-w-xl mx-auto p-6 flex flex-col items-center gap-6">

      {institution.logoUrl && (
        <img
          src={institution.logoUrl}
          alt={institution.name}
          className="w-40 h-40 object-contain rounded-lg shadow-sm"
        />
      )}

      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{institution.name}</h1>
        {institution.motto && (
          <p className="mt-1 text-sm italic text-gray-500 dark:text-gray-400">{institution.motto}</p>
        )}
      </div>

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

export default InstitutionProfilePage;
```

---

## Step 11 — Onboarding wizard: insert Brand & Profile step

**File:** `sms-system/src/scenes/(dashboard)/super-admin/onboard-institution/index.tsx`

The wizard currently has 2 steps. Brand & Profile is inserted as step 2; admin creation becomes step 3.

### 11a. Add `BrandForm` import

```tsx
import BrandForm from '@/components/forms/BrandForm';
```

### 11b. Update `FlowState` type

Replace the current type:

```typescript
// Before (2-step)
type FlowState =
  | { step: 'step1' }
  | { step: 'step2'; institutionId: string; institutionName: string }
  | { step: 'done'; institutionId: string; institutionName: string; adminName: string };

// After (3-step)
type FlowState =
  | { step: 'step1' }
  | { step: 'step2'; institutionId: string; institutionName: string }
  | { step: 'step3'; institutionId: string; institutionName: string }
  | { step: 'done'; institutionId: string; institutionName: string; adminName: string };
```

### 11c. Update `STEP_LABELS`

```typescript
// Before
const STEP_LABELS = ['Create Institution', 'Create Admin'];

// After
const STEP_LABELS = ['Create Institution', 'Brand & Profile', 'Create Admin'];
```

### 11d. Update `getNodeState` for 3 nodes

```typescript
function getNodeState(nodeIndex: number, flow: FlowState): NodeState {
  if (flow.step === 'step1') return nodeIndex === 0 ? 'current' : 'pending';
  if (flow.step === 'step2') return nodeIndex === 0 ? 'completed' : nodeIndex === 1 ? 'current' : 'pending';
  if (flow.step === 'step3') return nodeIndex < 2 ? 'completed' : 'current';
  return 'completed'; // 'done'
}
```

### 11e. Add step2 (Brand & Profile) render block

After the `step1` block and before the existing `step2` block, insert:

```tsx
{state.step === 'step2' && (
  <>
    <p className="mt-4 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
      Institution created — add brand data now or skip this step.
    </p>
    <BrandForm
      institutionId={state.institutionId}
      initialData={{ name: state.institutionName }}
      readOnlyName
      onSuccess={() => setState({ step: 'step3', institutionId: state.institutionId, institutionName: state.institutionName })}
      onSkip={() => setState({ step: 'step3', institutionId: state.institutionId, institutionName: state.institutionName })}
    />
  </>
)}
```

### 11f. Rename existing `step2` block to `step3`

Replace `state.step === 'step2'` with `state.step === 'step3'` in the admin creation block:

```tsx
{state.step === 'step3' && (
  <>
    <p className="mt-4 ...">
      Institution created — completing this step links the admin account to it.
    </p>
    <AdminCreateUserForm
      initialInstitutionId={state.institutionId}
      lockedRole="institution_admin"
      onSuccess={(adminName) =>
        setState({
          step: 'done',
          institutionId: state.institutionId,
          institutionName: state.institutionName,
          adminName,
        })
      }
    />
  </>
)}
```

---

## Step 12 — Route registration (`App.tsx`)

**File:** `sms-system/src/App.tsx`

### 12a. Add imports

```tsx
import BrandSettingsPage from '@/scenes/(dashboard)/brand-settings';
import InstitutionProfilePage from '@/scenes/(dashboard)/institution-profile';
```

### 12b. Add routes (inside `<Routes>`, after existing routes)

```tsx
<Route
  path="/brand-settings"
  element={
    (role === 'super_admin' || role === 'institution_admin')
      ? <BrandSettingsPage />
      : <Navigate to="/" replace />
  }
/>
<Route
  path="/institution-profile"
  element={
    ['senior_teacher', 'regular_teacher', 'student', 'parent'].includes(role ?? '')
      ? <InstitutionProfilePage />
      : <Navigate to="/" replace />
  }
/>
```

---

## Step 13 — Navigation links (`Menu.tsx`)

**File:** `sms-system/src/components/Menu.tsx`

Two new menu items go into the `OTHER` section (currently contains only "Profile").

### 13a. Add "Brand Settings" for `institution_admin`

Insert in the `OTHER` section items array, after the `Profile` entry:

```typescript
{
  icon: "/setting.png",
  label: "Brand Settings",
  href: "/brand-settings",
  visible: ["institution_admin"],
},
```

### 13b. Add "Institution Info" for lower four roles

Insert after the Brand Settings entry:

```typescript
{
  icon: "/profile.png",
  label: "Institution Info",
  href: "/institution-profile",
  visible: ["senior_teacher", "regular_teacher", "student", "parent"],
},
```

The `OTHER` section after both additions:

```typescript
{
  title: "OTHER",
  items: [
    {
      icon: "/profile.png",
      label: "Profile",
      href: "/profile",
      visible: ["super_admin", "institution_admin", "senior_teacher", "regular_teacher", "student", "parent"],
    },
    {
      icon: "/setting.png",
      label: "Brand Settings",
      href: "/brand-settings",
      visible: ["institution_admin"],
    },
    {
      icon: "/profile.png",
      label: "Institution Info",
      href: "/institution-profile",
      visible: ["senior_teacher", "regular_teacher", "student", "parent"],
    },
  ],
},
```

---

## Step 14 — Firebase Storage rules deployment (external)

**This step is external to the codebase.** Deploy via the Firebase Console (Storage → Rules tab) or the Firebase CLI.

The complete rule set to deploy is in spec Section 2. For reference:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    function canWriteInstitutionFile(institutionId) {
      let u = firestore.get(
        /databases/(default)/documents/users/$(request.auth.uid)
      ).data;
      return u.role == 'super_admin'
        || (u.role == 'institution_admin' && u.institutionId == institutionId);
    }

    match /institutions/{institutionId}/logo {
      allow read: if request.auth != null;
      allow write: if request.auth != null
        && request.resource.contentType.matches('image/.*')
        && request.resource.size < 1 * 1024 * 1024
        && canWriteInstitutionFile(institutionId);
    }
  }
}
```

**⚠ Prerequisite:** Firebase Storage must be enabled in the Firebase Console for the project. If it has not been provisioned, go to Storage → Get Started and provision it before deploying the rules.

**Firestore rules:** No changes. The existing deployed rule already covers `institution_admin` updates to the `institutions` collection. See spec Section 3.

---

## Testing Checklist

Work through each scenario after all steps are complete.

### CSS / theming
- [ ] Log in as `super_admin` — accent colors match the previous sky-blue (baseline).
- [ ] Log in as `institution_admin` with no `brandColor` set — accent colors still match sky-blue (CSS fallback in `:root`).
- [ ] Set a brand color (e.g. `#e84393`, hot pink) via `BrandForm`. On next login, all `lamaSky` / `lamaSkyLight` surfaces reflect the new tint.
- [ ] Set brand color to a very dark hex — verify the guidance note appears in `BrandForm` and that the UI is still usable.

### Sidebar header
- [ ] `super_admin` sidebar: original `/logo.png` + "School" text is unchanged.
- [ ] `institution_admin` with `logoUrl` set: institution image and name appear in sidebar header.
- [ ] `institution_admin` with no `logoUrl`: institution name only (no broken image).
- [ ] At mobile width (<1024 px): only the icon (institution image or `/logo.png`) is visible; name is hidden.

### `BrandForm` — edit page
- [ ] `institution_admin` navigates to `/brand-settings` via sidebar or card "Edit →" link.
- [ ] Form pre-populates with existing brand data.
- [ ] Submitting with a new image: Storage path `institutions/{id}/logo` is updated; `logoUrl` in Firestore is updated.
- [ ] Image preview renders before submit (via `URL.createObjectURL`).
- [ ] File >1 MB: Storage rejects the upload (Storage rule enforces size cap); UI shows the error.
- [ ] Non-image file type: Storage rejects upload (Storage rule enforces content type).
- [ ] `super_admin` navigates to `/brand-settings?institutionId=<id>` — form loads with that institution's data.
- [ ] `super_admin` navigates to `/brand-settings` (no query param) — error message is displayed.

### Onboarding wizard
- [ ] Wizard shows 3 steps: "Create Institution" → "Brand & Profile" → "Create Admin".
- [ ] Completing step 1 advances to step 2 with institution name pre-populated and locked.
- [ ] Clicking "Skip" on step 2 advances to step 3 without saving brand data.
- [ ] Clicking "Save" on step 2 with data saves brand data and advances to step 3.
- [ ] Completing step 3 shows the existing done screen with institution name, ID, and admin name.

### `InstitutionBrandCard` (AdminPage)
- [ ] Card is visible on the `institution_admin` dashboard, below `<Announcements />`.
- [ ] Card shows logo, name, motto, phone, email, address if set.
- [ ] "Edit →" link navigates to `/brand-settings`.
- [ ] No brand data set: empty-state message "No brand data set. Add it now →" is shown.

### `/institution-profile` page
- [ ] `senior_teacher` / `regular_teacher` / `student` / `parent` can access `/institution-profile`.
- [ ] `institution_admin` navigating to `/institution-profile` is redirected to `/`.
- [ ] `super_admin` navigating to `/institution-profile` is redirected to `/`.
- [ ] Logo renders at 160×160 px, prominently above name and motto.
- [ ] No logo: name and motto appear without broken image space.
- [ ] "Institution Info" sidebar link is visible and active for the four lower roles.
- [ ] "Institution Info" link does not appear for `institution_admin` or `super_admin`.

### Navigation
- [ ] "Brand Settings" sidebar link visible for `institution_admin`, hidden for all others.
- [ ] "Institution Info" sidebar link visible for `senior_teacher`, `regular_teacher`, `student`, `parent`; hidden for `institution_admin` and `super_admin`.

---

## Open Items

Carry-forward from spec Section 11 — not in scope for this implementation.

| Item | Notes |
| --- | --- |
| Dark mode brand color | Dark mode variants use hardcoded `dark:bg-sky-*` classes and are not overridden by `--brand-accent`. Requires a `--brand-accent-dark` CSS variable and additional `color-mix()` expressions. Deferred. |
| Full palette replacement | Only `lamaSky` / `lamaSkyLight` are replaced. `lamaYellow`, `lamaPurple` remain hardcoded. |
| `super_admin` institution list | `super_admin` has no UI to navigate to `/brand-settings?institutionId=<id>` other than the browser URL bar. Requires a per-institution management list page (separate future item). |
| Post-save institution refresh | `institution` in `AuthContext` is stale after saving via `BrandForm`. Brand color and logo update on next login. If live refresh is needed, call `refreshProfile()` from `onSuccess` in `BrandSettingsPage` — but `refreshProfile` would also need to re-fetch the institution doc (already added in Step 3f). |
