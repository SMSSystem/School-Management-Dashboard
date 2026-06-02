# Photo Upload Implementation Plan

## Overview

Adds profile photo upload functionality to the `/profile` page for all six roles.  
Users select a local image file, which is compressed client-side before being uploaded to Firebase Storage. The resulting download URL is written to the user's `users/{uid}` Firestore document (the single source of truth). Firebase Auth's `user.photoURL` is **not** updated.

**Scope:** Profile page only. The `SuperAdminCreateUserForm` (create-user flow) is explicitly excluded — photo upload is deferred to the user's own profile page after account creation.

**Availability:** All six roles (`super_admin`, `institution_admin`, `senior_teacher`, `regular_teacher`, `student`, `parent`). No role-based restriction on photo upload.

**Data mode gating:** Upload is only functional when `DATA_MODE === 'live'`. The camera button is disabled in `mock` and `blank` modes.

---

## Key Decisions

| Decision | Choice | Reason |
|---|---|---|
| Storage backend | Firebase Storage | Correct tool for binary files. Base64 in Firestore would bloat every `users/{uid}` document read — including the one fired by `AuthContext.fetchRole()` on every page load. |
| Source of truth | Firestore `users/{uid}.photoURL` | Consistent with how all other profile fields are stored and read. Firebase Auth's `user.photoURL` is not updated. |
| Storage path | `profile-photos/{uid}/avatar.jpg` (fixed) | Overwrites on each upload — no orphaned files accumulate, no cleanup logic required. |
| Compression | Canvas API, output JPEG | `maxDim = 400` (5× the 80px display size; sufficient for 2× retina). All input types (JPEG/PNG/WebP) → JPEG output for predictable content type and size. Typical output: 15–30 KB. |
| Pre-compression size limit | 2 MB (`file.size`) | Rejects obviously oversized files before any Canvas work is done. |
| Minimum dimension | 100 × 100 px | Rejects app icons, tiny thumbnails, accidental UI screenshots. |
| New files location | `src/lib/` | Matches existing convention (`AuthContext.tsx`, `useTheme.ts`, `utils.ts` all live in `src/lib/`). No `src/hooks/` directory exists. |
| `compressImage` return type | Discriminated union `{ ok: true; blob } \| { ok: false; error }` | Allows the hook to pattern-match on `result.ok` without try/catch for validation errors. |
| Activity log entry | `photo_update` batched with Firestore write | `photo_update` `ActivityEventType` is already defined in `firebase.ts`. The activity log renderer in the profile page already handles it. Batch guarantees atomicity between the URL write and the log entry. |
| Auth context refresh | `refreshProfile()` after batch commit | Re-reads `users/{uid}` from Firestore, updates `authPhotoURL` in context, triggers avatar re-render without a page reload. |
| No package install needed | — | `firebase` v12.13.0 (already installed) includes `firebase/storage`. |
| Firestore rules | No change | `allow update: if isOwner(uid) && roleNotChanged() && institutionNotChanged()` already permits writing `photoURL` to one's own document. |

---

## Prerequisites — Firebase Console (manual steps)

These must be completed before any code is deployed to a live environment.

### 1. Enable Firebase Storage

Firebase Console → your project → Build → Storage → Get started → Spark (free) plan → choose a region.

### 2. Set Storage Security Rules

In the Storage **Rules** tab, replace the default rules with:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /profile-photos/{uid}/avatar.jpg {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.auth.uid == uid
                   && request.resource.size < 2 * 1024 * 1024
                   && request.resource.contentType.matches('image/(jpeg|png|webp)');
    }
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

Rule enforces: authenticated owner only, 2 MB max, image MIME type only. The fallthrough deny-all mirrors the defence-in-depth pattern used in the Firestore rules.

### 3. Populate `VITE_FIREBASE_STORAGE_BUCKET`

The key is already wired into `firebaseConfig` in `src/lib/firebase.ts` — it just needs a value in `.env.local`.

---

## Free Tier Impact

Firebase Spark plan Storage limits:

| Limit | Value |
|---|---|
| Total storage | 5 GB |
| Download bandwidth | 1 GB / day |
| Upload operations | 20,000 / day |

For a typical school deployment (e.g., 500 users × 1 avatar upload × ~25 KB compressed) = ~12 MB total storage used. Well within 5 GB.  
Download bandwidth: browser image caching means each avatar is fetched from Storage once per browser, then served from cache on subsequent page loads. The 1 GB/day limit is not a realistic concern in practice.

---

## Files Changed

| File | Status |
|---|---|
| `src/lib/firebase.ts` | Modified |
| `src/lib/AuthContext.tsx` | Modified |
| `src/lib/compressImage.ts` | **New** |
| `src/lib/usePhotoUpload.ts` | **New** |
| `src/scenes/(dashboard)/profile/index.tsx` | Modified |
| `src/components/ProfilePageSkeleton.tsx` | No change |
| `package.json` | No change |
| Firestore rules | No change |
| Firebase Console Storage rules | Manual step (see Prerequisites) |

---

## File 1 — `src/lib/firebase.ts`

### a) Add Storage initialisation

Add import and export alongside the existing `getFirestore` lines:

```ts
import { getStorage } from 'firebase/storage';

export const storage = getStorage(app);
```

### b) Extend `UserDocument` type

Add one optional field. Existing documents without `photoURL` remain valid — no Firestore migration required.

```ts
export type UserDocument = {
  role: Role;
  name: string;
  institutionId: string;
  phone?: string;
  address?: string;
  status?: 'active' | 'inactive' | 'suspended';
  department?: string;
  emergencyContact?: string;
  linkedAccounts?: string;
  photoURL?: string;   // ← add
};
```

---

## File 2 — `src/lib/AuthContext.tsx`

All changes follow the exact same pattern as the existing `phone`, `address`, `linkedAccounts` fields.

### a) Extend the interface

```ts
interface AuthContextValue {
  // ... existing fields ...
  linkedAccounts: string | null;
  photoURL: string | null;   // ← add
  loading: boolean;
  // ...
}
```

### b) Add state

```ts
const [linkedAccounts, setLinkedAccounts] = useState<string | null>(null);
const [photoURL, setPhotoURL] = useState<string | null>(null);   // ← add
```

### c) Set in `fetchRole` (alongside `setLinkedAccounts`)

```ts
setLinkedAccounts((data?.linkedAccounts as string) ?? null);
setPhotoURL((data?.photoURL as string) ?? null);   // ← add
```

### d) Clear in sign-out block (alongside `setLinkedAccounts`)

In the `else` branch of `onAuthStateChanged` where the user is null:

```ts
setLinkedAccounts(null);
setPhotoURL(null);   // ← add
```

### e) Set in `refreshProfile` (alongside `setLinkedAccounts`)

```ts
setLinkedAccounts((data?.linkedAccounts as string) ?? null);
setPhotoURL((data?.photoURL as string) ?? null);   // ← add
```

### f) Expose in provider value

```tsx
<AuthContext.Provider value={{
  user, role, institutionId, displayName,
  phone, address, userStatus, department,
  emergencyContact, linkedAccounts,
  photoURL,   // ← add
  loading, signIn, signOut, refreshProfile
}}>
```

---

## File 3 — `src/lib/compressImage.ts` (new file)

Single exported async function with a discriminated-union return type. No library dependency — uses the native browser Canvas API.

```ts
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIN_DIM = 100;

export type CompressionError =
  | 'invalid_type'
  | 'too_large'
  | 'too_small'
  | 'load_failed'
  | 'compress_failed';

export type CompressResult =
  | { ok: true; blob: Blob }
  | { ok: false; error: CompressionError };

export function compressImage(
  file: File,
  options: { maxDim?: number; quality?: number; maxBytes?: number } = {}
): Promise<CompressResult> {
  const { maxDim = 400, quality = 0.85, maxBytes = 2 * 1024 * 1024 } = options;

  if (!ALLOWED_TYPES.has(file.type))
    return Promise.resolve({ ok: false, error: 'invalid_type' });
  if (file.size > maxBytes)
    return Promise.resolve({ ok: false, error: 'too_large' });

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      if (img.width < MIN_DIM || img.height < MIN_DIM) {
        resolve({ ok: false, error: 'too_small' });
        return;
      }

      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ ok: false, error: 'compress_failed' });
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve({ ok: true, blob })
            : resolve({ ok: false, error: 'compress_failed' }),
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ ok: false, error: 'load_failed' });
    };

    img.src = url;
  });
}
```

### Compression parameters

| Parameter | Default | Notes |
|---|---|---|
| `maxDim` | `400` | Max pixel dimension (width or height). Aspect ratio is preserved. 400px = 5× the 80px avatar display size; sufficient for 2× retina screens. |
| `quality` | `0.85` | JPEG quality. 0.85 gives good visual quality with significant size reduction. |
| `maxBytes` | `2 * 1024 * 1024` | Pre-compression raw file size limit (2 MB). Checked against `file.size` before any Canvas work. |
| `MIN_DIM` | `100` | Hardcoded minimum dimension. Rejects icons and thumbnails below 100 × 100 px. |

### Input → output behaviour

- JPEG input → JPEG output (same format, potentially smaller)
- PNG input → JPEG output (loses transparency; acceptable for profile photos)
- WebP input → JPEG output
- Images smaller than `maxDim` in both dimensions are drawn at original size (scale = 1)

### Memory management

`URL.createObjectURL` is revoked in both the `onload` and `onerror` handlers to prevent memory leaks regardless of outcome.

---

## File 4 — `src/lib/usePhotoUpload.ts` (new file)

Custom hook encapsulating the full upload pipeline. Calls `useAuth()` internally — consistent with the existing convention in `SuperAdminCreateUserForm.tsx`.

```ts
import { useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { writeBatch, doc, collection } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { db, storage } from './firebase';
import { DATA_MODE } from './data';
import { compressImage } from './compressImage';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_type:    'Please select a JPEG, PNG, or WebP image.',
  too_large:       'File must be 2 MB or smaller before compression.',
  too_small:       'Image must be at least 100 × 100 pixels.',
  load_failed:     'Could not read the image file.',
  compress_failed: 'Could not process the image.',
};

export type PhotoUploadState = {
  uploading:        boolean;
  uploadError:      string | null;
  clearUploadError: () => void;
  handleFileSelect: (file: File) => Promise<void>;
};

export function usePhotoUpload(): PhotoUploadState {
  const { user, institutionId, refreshProfile } = useAuth();
  const [uploading, setUploading]     = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const clearUploadError = () => setUploadError(null);

  const handleFileSelect = async (file: File) => {
    if (DATA_MODE !== 'live') {
      setUploadError('Photo upload is only available in live mode.');
      return;
    }
    if (!user?.uid) return;

    setUploading(true);
    setUploadError(null);

    const result = await compressImage(file);
    if (!result.ok) {
      setUploadError(ERROR_MESSAGES[result.error] ?? 'Upload failed.');
      setUploading(false);
      return;
    }

    try {
      const storageRef = ref(storage, `profile-photos/${user.uid}/avatar.jpg`);
      await uploadBytes(storageRef, result.blob, { contentType: 'image/jpeg' });
      const downloadURL = await getDownloadURL(storageRef);

      const logInstitutionId = institutionId === '*' ? '' : (institutionId ?? '');
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', user.uid), { photoURL: downloadURL });
      batch.set(doc(collection(db, 'users', user.uid, 'activity_log')), {
        eventType:     'photo_update',
        detail:        'Profile photo updated',
        timestamp:     new Date().toISOString(),
        uid:           user.uid,
        institutionId: logInstitutionId,
      });
      await batch.commit();
      await refreshProfile();
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return { uploading, uploadError, clearUploadError, handleFileSelect };
}
```

### Upload pipeline (step by step)

1. Guard: `DATA_MODE !== 'live'` → early return with error message
2. Guard: `!user?.uid` → silent early return (should never occur; auth is gated by `Protected.tsx`)
3. Set `uploading = true`, clear previous error
4. `compressImage(file)` → validates type, size, dimensions, then compresses
5. If compression fails → set error message, set `uploading = false`, return
6. `uploadBytes(storageRef, blob)` → uploads to `profile-photos/{uid}/avatar.jpg`
7. `getDownloadURL(storageRef)` → retrieves the public CDN URL
8. `writeBatch`: atomically writes `photoURL` to `users/{uid}` **and** appends a `photo_update` entry to `users/{uid}/activity_log`
9. `refreshProfile()` → re-reads `users/{uid}`, updates `authPhotoURL` in `AuthContext`
10. `finally`: set `uploading = false`

### Notes

- `institutionId === '*'` handling (super_admin) mirrors the same guard in the profile page's `onSubmit`.
- `e.target.value = ''` reset on the file input (in the profile page) ensures the same file can be re-selected immediately after an error.
- `photo_update` is already defined as an `ActivityEventType` in `firebase.ts` and already rendered by the activity log section in the profile page.

---

## File 5 — `src/scenes/(dashboard)/profile/index.tsx`

### a) New imports

Add `useRef` to the existing `react` import:
```ts
import { useEffect, useRef, useState } from 'react';
```

Add the hook import alongside the other `@/lib` imports:
```ts
import { usePhotoUpload } from '@/lib/usePhotoUpload';
```

### b) Destructure `photoURL` from `useAuth()`

```ts
const {
  user, role, institutionId, displayName,
  phone: authPhone, address: authAddress, userStatus,
  department: authDepartment, emergencyContact: authEmergencyContact,
  linkedAccounts: authLinkedAccounts,
  photoURL: authPhotoURL,   // ← add
  refreshProfile,
} = useAuth();
```

### c) New hooks — placement

Insert after the existing `profileLoading` `useEffect` (after line ~126), before `const currentRole`:

```tsx
const { uploading, uploadError, clearUploadError, handleFileSelect } = usePhotoUpload();
const fileInputRef = useRef<HTMLInputElement>(null);
```

Both must be unconditional and before the `if (profileLoading) return <ProfilePageSkeleton />` early return. See hook call order table below.

### d) Update `profileByRole` photo sources

In mock mode, keep existing mock data photos unchanged. In live/blank mode (`!USE_MOCK`), use `authPhotoURL ?? "/avatar.png"` for all roles.

| Role | Before | After |
|---|---|---|
| `super_admin` | `user?.photoURL ?? "/avatar.png"` | `USE_MOCK ? "/avatar.png" : (authPhotoURL ?? "/avatar.png")` |
| `institution_admin` | `user?.photoURL ?? "/avatar.png"` | `USE_MOCK ? "/avatar.png" : (authPhotoURL ?? "/avatar.png")` |
| `regular_teacher` | `teacher.photo` | `USE_MOCK ? teacher.photo : (authPhotoURL ?? "/avatar.png")` |
| `senior_teacher` | `teacher.photo` | `USE_MOCK ? teacher.photo : (authPhotoURL ?? "/avatar.png")` |
| `student` | `student.photo` | `USE_MOCK ? student.photo : (authPhotoURL ?? "/avatar.png")` |
| `parent` | `parent.photo` | `USE_MOCK ? parent.photo : (authPhotoURL ?? "/avatar.png")` |

### e) Hidden file input

Add inside `<div className="relative w-20 h-20">` alongside the existing `<img>` and `<button>`:

```tsx
<input
  ref={fileInputRef}
  type="file"
  accept="image/jpeg,image/png,image/webp"
  className="sr-only"
  onChange={(e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  }}
/>
```

`e.target.value = ''` resets the input so the same file can be re-selected after an error without requiring the user to pick a different file first.

### f) Uploading overlay

Add inside `<div className="relative w-20 h-20">` after the `<img>`:

```tsx
{uploading && (
  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
    <svg className="w-5 h-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12" cy="12" r="10"
        stroke="currentColor" strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
      />
    </svg>
  </div>
)}
```

The existing `<div className="relative w-20 h-20">` wrapper already provides the positioning context.

### g) Updated camera button

Replace the existing no-op `<button>` with:

```tsx
<button
  type="button"
  onClick={() => fileInputRef.current?.click()}
  disabled={uploading || DATA_MODE !== 'live'}
  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-sky-600 text-white flex items-center justify-center shadow-sm hover:bg-sky-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
  aria-label="Change profile photo"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-4 h-4"
  >
    <path d="M9 4a1 1 0 0 0-.8.4L7.2 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.2l-1-1.6A1 1 0 0 0 13 4H9zm3 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10z" />
  </svg>
</button>
```

`disabled` when `uploading` is true (prevents double-submit) or when `DATA_MODE !== 'live'` (upload unavailable).

### h) Upload error display

Add inside the header `<section>`, after the `<div className="flex flex-col gap-4 sm:flex-row sm:items-center">` flex row:

```tsx
{uploadError && (
  <div className="mt-3 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
    <span>{uploadError}</span>
    <button
      type="button"
      onClick={clearUploadError}
      className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
      aria-label="Dismiss error"
    >
      ✕
    </button>
  </div>
)}
```

The error also auto-clears at the start of the next `handleFileSelect` call (`setUploadError(null)` at the top of the function).

---

## Hook Call Order in `profile/index.tsx` (after changes)

Rules of Hooks requires all hooks to be called unconditionally and before any early return.

| # | Hook | Notes |
|---|---|---|
| 1 | `useAuth()` | Reads auth context |
| 2 | `useState(DATA_MODE === 'live')` | `profileLoading` |
| 3 | `useEffect(...)` | Fires Firestore read for `profileLoading` |
| 4 | `usePhotoUpload()` | **New** — internally calls `useAuth()`, `useState` × 2 |
| 5 | `useRef<HTMLInputElement>(null)` | **New** — file input ref |
| 6 | `useForm(...)` | Contact info form |
| 7 | `useState<string \| null>(null)` | `saveError` |
| — | `if (profileLoading) return <ProfilePageSkeleton />` | Early return — all hooks above this line |

---

## Data Flow

```
User clicks camera button
  → fileInputRef.current.click()
    → OS file picker opens
      → user selects file
        → onChange fires → handleFileSelect(file)

handleFileSelect(file):
  1. Guard: DATA_MODE !== 'live' → setUploadError, return
  2. Guard: !user?.uid → return
  3. setUploading(true), setUploadError(null)
  4. compressImage(file)
     ├── invalid_type / too_large → synchronous rejection
     ├── load Image → too_small → rejection
     └── Canvas drawImage → toBlob → { ok: true, blob }
  5. uploadBytes(storage, 'profile-photos/{uid}/avatar.jpg', blob)
  6. getDownloadURL(storageRef) → downloadURL
  7. writeBatch:
     ├── users/{uid}.photoURL = downloadURL
     └── users/{uid}/activity_log/{newDoc} = { eventType: 'photo_update', ... }
  8. refreshProfile()
     └── getDoc(users/{uid})
         └── setPhotoURL(downloadURL) in AuthContext
             └── authPhotoURL updates in ProfilePage
                 └── profileByRole[role].photo updates
                     └── <img src={profile.photo}> re-renders with new avatar
  9. finally: setUploading(false)
```

---

## What Is Not Changed

- **`src/components/ProfilePageSkeleton.tsx`** — the avatar circle is already skeletonized (`Pulse className="w-20 h-20 rounded-full shrink-0"`).
- **`src/components/forms/SuperAdminCreateUserForm.tsx`** — photo upload at account creation time is out of scope. No UID exists when the form renders, making pre-creation upload significantly more complex for negligible gain.
- **`package.json`** — `firebase` v12.13.0 already includes `firebase/storage`. No install required.
- **Firestore security rules** — `allow update: if isOwner(uid) && roleNotChanged() && institutionNotChanged()` already permits writing `photoURL` to one's own document. No rule change needed.
- **Firebase Auth `user.photoURL`** — deliberately not updated. Firestore is the sole source of truth for the photo URL.
