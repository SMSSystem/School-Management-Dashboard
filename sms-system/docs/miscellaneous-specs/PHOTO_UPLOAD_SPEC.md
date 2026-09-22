# App-Wide Photo Upload (Base64-Encoded) — Feature Spec

> **Status:** Planned — not yet implemented (spec written before code, per this repo's standing convention)
> **Feature:** Adds a base64-encoded profile photo to Student and Teacher accounts, editable via their respective edit modals; an optional photo input on the admin "Create Account" form (`AdminCreateUserForm.tsx`); and an optional photo capture on the public Student Registration form, carried over automatically when a registration is converted into a real account.
> **Storage:** Firestore only (base64 data URL strings) — no Firebase Storage. Confirmed during investigation that Storage is entirely unused/unconfigured in this project (no `getStorage`/`uploadBytes` anywhere in `src/`, no `storage.rules`, no `storage` key in `firebase.json`), so this spec introduces no new infrastructure.
> **Primary roles:** Upload / replace / remove restricted to `institution_admin` and `super_admin` only — no self-service photo editing in v1.

---

## Overview

The app currently has **no user photo field anywhere** — `UserDocument` has none, no form has a file input, and no upload/resize code exists for user photos specifically. It does, however, already have two adjacent things that shaped this spec heavily:

1. **A proven base64-image technique**, duplicated twice already: `institution-profile/index.tsx`'s local `processImage(file, maxPx)` (canvas resize → `toDataURL()`, used for the institution logo at max 512px and the report-card signature at max 300px) and an independent second copy in `BrandForm.tsx`. This spec extracts a single shared utility instead of adding a third copy.
2. **Partial, never-finished groundwork for exactly this feature**: `ActivityEventType` already includes `'photo_update'` (`src/lib/firebase.ts:308`), and `profile/index.tsx:638-639` already renders "Updated profile photo" for that event type in the activity timeline — with no code anywhere that actually emits it. `Navbar.tsx:40-41` and `TopHeader.tsx:56-63` already render an avatar `<img>` from `user.photoURL` (Firebase Auth's native profile field) — wired to a source that has never been written to. `list/students/index.tsx` and `list/teachers/index.tsx` already render `<img src={item.photo}>` in their Name column (`students/index.tsx:144-148`) — hardcoded to `"/avatar.png"` for every row (`students/index.tsx:83`).

This spec wires all of that dormant scaffolding up to a real feature, using Firestore as the only source of truth, with one narrow, best-effort exception for Firebase Auth's native `photoURL` field at account-creation time only (see §Firebase Auth `photoURL` Sync).

---

## Background / Investigation Findings

Everything below was confirmed by direct file reads and web searches during investigation — not assumed.

- **No Firebase Storage in this project.** Grep for `getStorage`/`uploadBytes`/`firebase/storage` across `src/` returns zero matches; `firebase.json` has no `storage` key; no `storage.rules` file exists anywhere in the repo. Base64-in-Firestore is the only option without introducing new infrastructure, which matches the explicit project-owner choice to store photos "via base64-encoding."
- **The `users` collection is read broadly, unpaginated, in real time.** `list/students/index.tsx:69-70` and `list/teachers/index.tsx:63-64` both run `onSnapshot(query(collection(db,"users"), where("institutionId","==",institutionId)))` — no `limit()`. The 20-row `PAGE_SIZE` (`src/lib/utils.ts:28`) is applied client-side via `.slice()` **after** every matching document has already been downloaded. The project's own `scripts/seed-bulk-institution.mjs` stress-tests a single institution at **~2,500 users**, and its own logs (`scripts/logs/seed-2026-09-21_10-00-03.log`) show `RESOURCE_EXHAUSTED` against the Spark-plan quota — **before any photo field exists.** Putting a base64 photo string directly on `UserDocument` would mean every real-time list-page load/update for that institution re-downloads every user's photo, not just the visible page. This is the single biggest risk this spec designs around.
- **Resolution: photos live in a separate per-user subcollection document, not a field on `users/{uid}`.** Firestore only transfers whole documents on a query — keeping the photo off the main user document means the existing unpaginated listeners never touch it. Photos are fetched individually, only where an avatar actually renders, and only for the rows currently on screen (see §List-Table Thumbnails).
- **`updateProfile()` (Firebase Auth) can only update the *currently signed-in* user's own profile.** There is no client-side mechanism to set `photoURL` on someone else's Auth account — that requires the Admin SDK, which this app doesn't have (no `functions/` directory, confirmed during the Students-import investigation earlier this session). The **only** moment a photo can reach Firebase Auth's native `photoURL` field at all is the brief window right after `createUserWithEmailAndPassword` on the secondary Auth instance, where the app is momentarily signed in *as the new account* — used already by `AdminCreateUserForm.tsx:311-317`'s `secondaryAuth` pattern. This is a hard platform constraint, not a design preference.
- **Denormalization convention exists but is deliberately not followed here.** `houseName` (`StudentForm.tsx:163`) and `assignedClassName` (`TeacherForm.tsx:183`, `AdminCreateUserForm.tsx:521`) are both copied from a user's own document onto other documents (attendance records, report cards, CSV exports) at write time. A photo following that same convention would multiply a multi-KB base64 string across many documents. This spec explicitly does **not** denormalize the photo anywhere — every surface that displays it fetches it on demand from its single canonical location.
- **The existing `photo_update`/`AuditEventType` scaffolding assumed self-service editing.** `profile/index.tsx`'s activity timeline renders `photo_update` entries as if the viewed account changed its own photo. Since this spec makes photo editing admin-only (not self-service), an admin-authored change needs to land in the affected account's own `activity_log` (so that account's own timeline stays meaningful) *and* in the institution's `audit_log` (so admins have an accountable record of who changed which account's photo) — see §Firestore Security Rules and §Activity/Audit Logging.
- **Client-side file-upload security research** (web search, OWASP File Upload Cheat Sheet and related sources): file extensions and browser-reported MIME types are trivially spoofed and are not a security control on their own; **magic-byte (file-signature) inspection** — reading the first few bytes of the file and comparing against known signatures — is the standard mitigation; OWASP additionally recommends **re-encoding images through a trusted library** as a sanitization step. This app already does the second thing by construction: every `processImage`-style pipeline decodes the file into an `<img>`/`<canvas>` and re-exports fresh pixel data via `toDataURL()`, which strips any non-pixel payload (EXIF metadata, embedded scripts, polyglot trailer data) — a file that isn't a genuinely decodable raster image simply fails at `img.onerror` and never produces output. This spec adds magic-byte sniffing as an additional, earlier check (see §Client-Side Image Processing & Security Pipeline). Sources: [Transloadit — Secure API file uploads with magic numbers](https://transloadit.com/devtips/secure-api-file-uploads-with-magic-numbers/), [FileSignature.org — Validate File Types by Magic Bytes](https://filesignature.org/guides/validate-file-type-magic-bytes), [Doyensec — Bypassing File Upload Restrictions](https://blog.doyensec.com/2025/01/09/cspt-file-upload.html).
- **This app has no backend at all**, so — unlike a typical OWASP-cheat-sheet deployment with a server tier — there is no second validation pass behind the client. The real, unbypassable enforcement boundary is **Firestore Security Rules**, which can validate that the `dataUrl` string is well-formed (correct `data:image/...;base64,` prefix, size ceiling) but — being string-pattern rules, not an image decoder — cannot verify the base64 payload is a genuinely valid image. This residual risk is stated plainly in §Security Considerations rather than glossed over.
- **The registration form is public and unauthenticated by design** (`App.tsx:125-141`, redirects away only if already logged in) and already has hand-written per-field size/shape validation in `firestore.rules:112-160` specifically because of spam risk on that open endpoint (`isValidRegistrationStudent`, `isValidRegistrationGuardian`). A photo field there needs the same treatment, and — critically — `isValidRegistrationStudent`'s `hasOnly([...])` (`firestore.rules:128`) pins the exact set of allowed keys on the `student` object; adding a new optional key without updating that list would make the rule reject every submission that includes a photo.
- **`processImage`'s existing two copies both special-case PNG vs. else-JPEG**, output quality 0.82 for JPEG. This spec's shared utility keeps that behavior and adds WEBP passthrough (per the requested 4-format whitelist), all still going through the same canvas re-encode.

---

## Design Decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Storage location | New subcollection document `users/{uid}/photo/current` (fields: `dataUrl`, `updatedAt`, `updatedBy`) — **not** a field on `users/{uid}` | Keeps the photo off every document the existing unpaginated Student/Teacher list listeners already download in bulk; fetched individually, only on demand. |
| Registration-form field | New optional `student.photoDataUrl` inside `EnrollmentRegistrationDocument` — **student only**, not guardians | Matches the explicit scope of this feature ("student accounts and teacher accounts in particular"); guardians never get accounts with photos in this spec. |
| Who can upload / replace / remove | `institution_admin` / `super_admin` only, for any account in their institution — no self-service | Explicit project-owner choice; matches this codebase's existing convention of admin-scoped write rules bundling `isAdminOrAbove()` (e.g. `firestore.rules:182-184`'s `users/{uid}` update rule). |
| Max photo dimension | 180px (long edge), JPEG quality 0.82 (PNG kept lossless, matching existing `processImage` behavior) | Splits the difference within the agreed 150–200px avatar-size range; consistent with the existing 300px/512px precedents at a smaller, list-row-appropriate size. |
| Accepted file types | JPEG, JPG, PNG, WEBP — exactly these 4, nothing else | Explicit project-owner choice. Enforced at three layers: `accept` attribute (UX only), magic-byte signature check (real client-side check), and the canvas decode step itself (anything that isn't a genuinely valid raster image fails here regardless of extension/MIME claims). |
| Max base64 string size | 60,000 characters (~44 KB raw, ample headroom over typical 180px JPEG output), enforced in Firestore rules | Firestore's 1 MiB/document ceiling is far above this; the tighter cap keeps per-row reads cheap in the list-table thumbnail case (§List-Table Thumbnails) regardless of institution size. |
| Denormalization | None — every display surface fetches the photo from `users/{uid}/photo/current` on demand | Avoids multiplying a multi-KB string across attendance records, report cards, CSV exports, etc., the way `houseName`/`assignedClassName` already are. |
| Firebase Auth `photoURL` sync | **Creation-time only** — set once via `updateProfile()` on the secondary Auth instance immediately after `createUserWithEmailAndPassword`, in both `AdminCreateUserForm.tsx` and `ConvertToAccountsPanel.tsx`'s registration-conversion flow. Best-effort (wrapped in try/catch, never blocks account creation or the Firestore write). Never touched again after creation. | `updateProfile()` can only affect the *currently signed-in* user, and the app is only ever transiently signed in as a newly-created account in that one window. Firestore remains the sole source of truth for every display surface at all times — this sync is a courtesy mirror for whatever might read Auth's native field, not a dependency. |
| Photo removal | Deletes the `users/{uid}/photo/current` document (not a null field) — admin-only, same permission as upload/replace | Absence of the document is the "no photo" state everywhere; avoids an extra null-check branch on every read path. |
| Create Account form scope | Optional photo input available for **any** role created via `AdminCreateUserForm.tsx` (one shared form component) | The form itself isn't role-specialized; restricting the input to only-when-role-is-student-or-teacher would need extra conditional UI for no real benefit — an admin/parent account simply won't have anywhere in the UI to view/edit that photo afterward, which is fine (harmless unused data, not a bug). |
| Ongoing (post-creation) edit scope | Only `StudentForm.tsx` and `TeacherForm.tsx` get a photo field in this spec | Matches the explicit ask. `ParentForm.tsx`/`InstitutionAdminForm.tsx` etc. are not touched — a documented, intentional gap, not an oversight. |
| Activity/audit logging | Every upload/replace/remove writes **two** entries: a `photo_update` entry to the *affected* account's own `users/{uid}/activity_log` (so their own timeline — already wired for this in `profile/index.tsx` — is accurate), and a `photo_change` entry to the acting admin's institution `audit_log` (accountability record) | The existing `activity_log` display code already assumes entries land on the affected account's own timeline; since edits are admin-initiated (not self-service), the write has to explicitly target the affected `uid`'s subcollection rather than the admin's own, which requires a small rules change (§Firestore Security Rules). |
| Shared image-processing utility | Extract one `src/lib/imageUpload.ts` used by `StudentForm.tsx`, `TeacherForm.tsx`, `AdminCreateUserForm.tsx`, and the registration form — instead of a third/fourth copy of `processImage` | `institution-profile/index.tsx` and `BrandForm.tsx` already duplicate this logic once; a third and fourth copy would compound an existing, already-noted smell rather than fix it. |

---

## Data Model

### New subcollection: `users/{uid}/photo/current`

```ts
// src/lib/firebase.ts — new type, alongside the other subcollection entry types
export type UserPhotoDocument = {
  dataUrl: string;      // "data:image/jpeg;base64,..." | "data:image/png;base64,..." | "data:image/webp;base64,..."
  updatedAt: Timestamp;
  updatedBy: string;    // uid of the admin who set it
};
```

Single fixed document ID (`"current"`) per user — no history/versioning in v1. A photo change is a `setDoc` (overwrite); removal is a `deleteDoc`.

### `EnrollmentRegistrationDocument` — one new optional field

```diff
 // src/lib/firebase.ts — student sub-object of EnrollmentRegistrationDocument
 student: {
   lastName: string;
   firstName: string;
   middleName?: string;
   requestedClass: string;
   dateOfBirth: string;
   gender: 'Male' | 'Female';
   email: string;
   lastSchoolAttended?: string;
   phone?: string;
   phone2?: string;
   citizenId?: string;
+  photoDataUrl?: string;   // same "data:image/...;base64,..." shape as UserPhotoDocument.dataUrl
 };
```

### `ActivityEventType` / `AuditEventType` — no new activity type needed, one new audit type

```diff
 export type AuditEventType =
   | 'role_change'
   | 'password_reset'
   | 'account_created'
   | 'account_suspended'
   | 'account_deleted'
   | 'permission_change'
-  | 'registration_status_change';
+  | 'registration_status_change'
+  | 'photo_change';
```

`ActivityEventType` already has `'photo_update'` (`firebase.ts:308`) — reused as-is, no change needed there.

---

## Firestore Security Rules

### New match block: `users/{uid}/photo/{photoId}`

Placed immediately after the existing `users/{uid}` block (`firestore.rules:164-188`). Read permission deliberately mirrors the parent `users/{uid}` read rule exactly (owner, same-institution admin, or same-institution teacher viewing a student's photo) — anyone who can see the profile can see its photo. Write/delete is the admin-only subset per the Design Decisions above.

```javascript
// ── User photo (per-user subcollection, single doc) ─────────────────────
match /users/{uid}/photo/{photoId} {
  // Same visibility as the profile itself.
  allow read: if isOwner(uid)
    || (isAdminOrAbove() && sameInstitution(get(/databases/$(database)/documents/users/$(uid)).data.institutionId))
    || (isTeacher() && sameInstitution(get(/databases/$(database)/documents/users/$(uid)).data.institutionId)
        && get(/databases/$(database)/documents/users/$(uid)).data.role == 'student');

  // Admin-only write/remove — no self-service in v1.
  allow create, update: if isAdminOrAbove()
    && sameInstitution(get(/databases/$(database)/documents/users/$(uid)).data.institutionId)
    && isValidPhotoDataUrl(request.resource.data.dataUrl)
    && request.resource.data.keys().hasOnly(['dataUrl', 'updatedAt', 'updatedBy'])
    && request.resource.data.updatedBy == request.auth.uid;

  allow delete: if isAdminOrAbove()
    && sameInstitution(get(/databases/$(database)/documents/users/$(uid)).data.institutionId);
}
```

New helper, alongside `isValidRegistrationStudent`/`isValidRegistrationGuardian` (`firestore.rules:126-161`):

```javascript
// Bounds the one field that matters for a base64 photo string: it must look
// like a data URI for one of the 4 whitelisted formats, and stay well under
// Firestore's 1MiB/doc ceiling. This is a shape/size check, not an image
// decoder — it cannot confirm the base64 payload is a genuinely valid image
// (see PHOTO_UPLOAD_SPEC.md §Security Considerations for the residual risk
// this leaves, and why it's an acceptable one given this app has no backend).
function isValidPhotoDataUrl(url) {
  return url is string
    && url.size() <= 60000
    && url.matches('^data:image/(jpeg|png|webp);base64,.+$');
}
```

### Extended: `users/{uid}/activity_log` create rule

Current rule (`firestore.rules:194-199`) only allows the *owner* to write their own entries — necessary to extend for admin-initiated photo changes, since the admin's `uid` never equals the affected account's `uid`:

```diff
 match /users/{uid}/activity_log/{eventId} {
   allow read:   if isOwner(uid);
-  allow create: if isOwner(uid)
-    && request.resource.data.uid == uid
-    && request.resource.data.keys().hasAll(['eventType','detail','timestamp','uid','institutionId']);
+  allow create: if (isOwner(uid)
+      || (isAdminOrAbove() && sameInstitution(get(/databases/$(database)/documents/users/$(uid)).data.institutionId)))
+    && request.resource.data.uid == uid
+    && request.resource.data.keys().hasAll(['eventType','detail','timestamp','uid','institutionId']);
   allow update, delete: if false;
```

### Extended: public registration `isValidRegistrationStudent`

Two changes to `firestore.rules:126-147` — add the key to `hasOnly()` (line 128), and add its optional-field validation clause (alongside the existing `lastSchoolAttended`/`phone`/`phone2`/`citizenId` clauses):

```diff
 function isValidRegistrationStudent(student) {
   return student.keys().hasAll(['lastName', 'firstName', 'requestedClass', 'dateOfBirth', 'gender', 'email'])
-    && student.keys().hasOnly(['lastName', 'firstName', 'middleName', 'requestedClass', 'dateOfBirth', 'gender', 'email', 'lastSchoolAttended', 'phone', 'phone2', 'citizenId'])
+    && student.keys().hasOnly(['lastName', 'firstName', 'middleName', 'requestedClass', 'dateOfBirth', 'gender', 'email', 'lastSchoolAttended', 'phone', 'phone2', 'citizenId', 'photoDataUrl'])
     && student.lastName is string && student.lastName.size() <= 100
     // ...(existing clauses unchanged)...
-    && (!('citizenId' in student) || (student.citizenId is string && student.citizenId.size() <= 50));
+    && (!('citizenId' in student) || (student.citizenId is string && student.citizenId.size() <= 50))
+    && (!('photoDataUrl' in student) || isValidPhotoDataUrl(student.photoDataUrl));
 }
```

### `institutions/{institutionId}/audit_log` — no rule change needed

The existing create rule (`firestore.rules:755-760`) already validates `hasAll([...])` on a fixed key list that a `photo_change` entry satisfies exactly (`eventType`, `detail`, `targetUid`, `targetName`, `performedBy`, `performedByName`, `timestamp`, `institutionId` — same shape `logRegistrationAudit` already writes). No rules edit required; only the new `AuditEventType` union member above.

### Firestore Indexes

**None required.** `users/{uid}/photo/current` is always read by direct document ID (`getDoc`), never queried — no composite index applies to single-document reads.

---

## Client-Side Image Processing & Security Pipeline

New shared module, replacing the two existing `processImage` duplicates' role for this feature (not touching the existing two — out of scope to refactor `institution-profile/index.tsx`/`BrandForm.tsx` unless asked):

```ts
// src/lib/imageUpload.ts

const MAGIC_BYTES: Record<string, number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png':  [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // "RIFF" — WEBP marker itself sits at bytes 8-11, checked separately
};

const MAX_SOURCE_FILE_BYTES = 5 * 1024 * 1024; // 5MB — reject before ever attempting to decode
const MAX_OUTPUT_CHARS = 60_000;               // mirrors the Firestore rules cap

export class PhotoValidationError extends Error {}

async function sniffFileType(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  for (const [mime, signatures] of Object.entries(MAGIC_BYTES)) {
    if (signatures.some((sig) => sig.every((byte, i) => head[i] === byte))) {
      if (mime === 'image/webp') {
        // RIFF prefix alone isn't specific enough — confirm the "WEBP" marker at bytes 8-11.
        const marker = String.fromCharCode(head[8], head[9], head[10], head[11]);
        if (marker !== 'WEBP') continue;
      }
      return mime;
    }
  }
  return null;
}

export async function processPhotoUpload(file: File, maxPx = 180): Promise<string> {
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new PhotoValidationError('Image must be 5MB or smaller.');
  }
  const sniffed = await sniffFileType(file);
  if (!sniffed) {
    throw new PhotoValidationError('File must be a JPEG, PNG, or WEBP image.');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const fmt = sniffed === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(fmt, fmt === 'image/jpeg' ? 0.82 : undefined));
    };
    // A file that passed the magic-byte check but isn't actually a decodable
    // raster image (crafted/corrupt/polyglot) fails here — the browser's own
    // image decoder is the real backstop, not just a formality.
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new PhotoValidationError('Could not read this image file.')); };
    img.src = objectUrl;
  });

  if (dataUrl.length > MAX_OUTPUT_CHARS) {
    // Should be rare at 180px/quality 0.82, but fail fast client-side with a
    // clear message rather than letting the Firestore rules reject it silently.
    throw new PhotoValidationError('Processed image is unexpectedly large — try a simpler photo.');
  }
  return dataUrl;
}
```

Notes:

- WEBP is accepted as an input format but always re-encoded to JPEG on output (mirrors the existing `processImage` precedent's PNG-vs-else-JPEG branching — no separate WEBP output path needed since the canvas step normalizes everything).
- `accept="image/jpeg,image/png,image/webp"` on every `<input type="file">` using this pipeline is still worth keeping — it's a real UX improvement (filters the OS file picker) even though it isn't a security boundary on its own.
- This function is UI-agnostic (no React) so it can be imported identically by `StudentForm.tsx`, `TeacherForm.tsx`, `AdminCreateUserForm.tsx`, and the registration form.

---

## Firebase Auth `photoURL` Sync

Only two call sites ever touch this, both at account-creation time, both wrapped best-effort (mirrors the already-established `try { await deleteUser(createdUser); } catch { /* best-effort */ }` pattern from the Students-import feature — a failure here must never block account creation or the Firestore photo write):

```ts
// Immediately after createUserWithEmailAndPassword succeeds, before signOut(secondaryAuth) —
// AdminCreateUserForm.tsx's onSubmit, and ConvertToAccountsPanel.tsx's persistStep.
if (photoDataUrl) {
  try {
    await updateProfile(credentials.user, { photoURL: photoDataUrl });
  } catch {
    // Best-effort only — Firestore (users/{uid}/photo/current) remains the
    // source of truth everywhere the app actually displays a photo; Auth's
    // photoURL has no documented size guarantee for a data URI, so a
    // rejection here is expected to be possible and is not fatal.
  }
}
```

Nothing else in the app ever calls `updateProfile()` for `photoURL` again after this. `Navbar.tsx` and `TopHeader.tsx` are updated to stop reading `user.photoURL` (see §Navbar / TopHeader) — so this sync has no functional dependency anywhere; it exists purely as a courtesy mirror for anything outside this app's own UI that might read Firebase Auth's native profile fields (e.g. the Firebase Console's Authentication tab).

---

## UI/UX Changes Per Surface

### `StudentForm.tsx` / `TeacherForm.tsx` (edit modals)

New field, rendered only when the signed-in user is `institution_admin`/`super_admin` (the same role gate the rules enforce — the field simply doesn't render for a `senior_teacher` viewing/editing, say, another student's assigned-class fields, consistent with those forms already being reused across roles with role-conditional fields elsewhere):

- Current photo preview (fetched via `getDoc(doc(db,'users',uid,'photo','current'))` when the modal opens; fallback initials avatar if none, matching `Navbar.tsx`'s existing `initial` fallback pattern).
- "Upload photo" / "Replace photo" file input → `processPhotoUpload()` → preview updates immediately (optimistic, pre-save).
- "Remove photo" button (only shown when a photo currently exists) — admin-only, per Design Decisions.
- On submit: if a new photo was selected, `setDoc(doc(db,'users',uid,'photo','current'), {dataUrl, updatedAt: serverTimestamp(), updatedBy: currentAdminUid})`, alongside the existing profile-field `batch.update(...)` (can be folded into the same `writeBatch` already used for the house-membership writes — no new transaction needed). If "Remove" was clicked, `batch.delete(doc(db,'users',uid,'photo','current'))` instead. Either way, also write the two log entries per §Activity/Audit Logging.

### `AdminCreateUserForm.tsx` (Create Account)

- New optional file input, same component, available regardless of selected role (see Design Decisions).
- Processed client-side identically (`processPhotoUpload()`) but the actual Firestore write (`setDoc` on `users/{newUid}/photo/current`) and the Auth `photoURL` sync both happen **after** `createUserWithEmailAndPassword` succeeds, in the same window as the existing `assignedClassName` write (`AdminCreateUserForm.tsx:521`) — i.e., as part of the already-existing post-creation Firestore writes, not a separate step.
- If a photo was selected but the *Firestore* write fails after Auth creation succeeded, this joins the form's existing rollback path (`deleteUser(createdUser)` — `AdminCreateUserForm.tsx:534-541`) exactly as every other post-creation field failure already does; no new failure-handling code needed.

### Public Registration form (`register/[institutionId]/index.tsx`)

- New optional file input on the student step only (not the mother/father steps).
- `processPhotoUpload()` client-side, result stored in local form state as `student.photoDataUrl`, submitted as part of the existing `enrollmentRegistrations` document create.
- **`ConvertToAccountsPanel.tsx`** (`persistStep`, student branch): after the student's account is created via `AdminCreateUserForm`, if `registration.student.photoDataUrl` is present, write it to the new account's `users/{uid}/photo/current` and run the same best-effort `updateProfile()` Auth sync — this is the literal "auto-created account via registration approval" scenario. No new UI here; this is a data carry-over inside logic that already exists.

### Navbar / TopHeader

Both currently read `user.photoURL` directly off the Firebase Auth `User` object (`Navbar.tsx:40-41`, `TopHeader.tsx:56-63`). Per the "Firestore is sole source of truth for display" decision, both switch to a new `photoUrl` field added to `AuthContext` (populated the same way `mustChangePassword` already is — one extra `getDoc` alongside the existing profile fetch in `fetchRole`/`refreshProfile`, not a new listener). Fallback behavior (initials circle / generic icon) is unchanged — only the data source changes.

### Profile page (`profile/index.tsx`)

Already has a photo `<img>` slot (`profile/index.tsx:470-474`) and an activity-timeline entry renderer for `photo_update` (`profile/index.tsx:638-639`) — both already correctly wired for the *viewed* account's own photo/timeline; this spec is what finally puts real data behind both. No structural change, just replacing whatever currently feeds `profile.photo` with a live `getDoc` against `users/{uid}/photo/current` for the profile being viewed.

### List-Table Thumbnails (`list/students/index.tsx`, `list/teachers/index.tsx`)

The `<img src={item.photo}>` slot in the Name column already exists (`students/index.tsx:144-148`) — currently fed a hardcoded `"/avatar.png"` for every row (`students/index.tsx:83`). Given the §Background finding about unpaginated `users` listeners at up to ~2,500 docs, this must **not** eagerly fetch a photo for every filtered row. Instead:

- A `useEffect` keyed on `paginatedData` (the already-existing post-`.slice()` 20-row page, not `filteredData`) fetches `getDoc` for just those ≤20 uids not already cached in a `Record<uid, string | null>` state map.
- Page navigation, search, and sort only ever add to that cache — never refetches an already-resolved uid.
- This bounds the additional read cost to at most `PAGE_SIZE` (20) per page view, regardless of institution size — the 2,500-user stress-test scenario stays unaffected by this feature.
- Rows without a cached/resolved photo yet, or with no photo document, render the same initials/generic fallback used elsewhere.

---

## Activity / Audit Logging

Every successful upload, replace, or remove (from any of the three write surfaces above) writes two entries in parallel with the photo write itself:

```ts
// Affected account's own timeline (requires the rules extension above)
await addDoc(collection(db, 'users', targetUid, 'activity_log'), {
  eventType: 'photo_update',
  detail: action === 'remove' ? 'Photo removed by administrator' : 'Photo updated by administrator',
  timestamp: new Date().toISOString(),
  uid: targetUid,
  institutionId,
});

// Institution admin audit trail (existing helper pattern, mirrors logRegistrationAudit)
await addDoc(institutionCollection(institutionId, 'audit_log'), {
  eventType: 'photo_change',
  detail: action === 'remove' ? `Removed photo for ${targetName}` : `Updated photo for ${targetName}`,
  targetUid,
  targetName,
  performedBy: adminUid,
  performedByName: adminDisplayName,
  timestamp: new Date().toISOString(),
  institutionId,
});
```

---

## Security Considerations

- **Client-side validation (magic bytes, canvas decode, size caps) is UX and defense-in-depth, not the actual security boundary.** Anyone can bypass all of it by calling the Firestore SDK directly with a crafted payload. This app has no backend, so **Firestore Security Rules are the real and only enforcement boundary** — see `isValidPhotoDataUrl` above.
- **Residual risk, stated plainly:** the rules' `.matches()` regex confirms the *string* looks like a valid data URI with an allowed MIME prefix under the size cap — it cannot decode the base64 payload to confirm it's a genuinely valid image. A malicious `institution_admin` (the only role permitted to write this field at all) could in principle write an arbitrary same-size base64 blob with a spoofed `data:image/jpeg;base64,` prefix. This is an accepted risk scoped to a trusted role tier (the same tier that already has broad write access to every profile field in the institution via the existing `users/{uid}` update rule) — not a new privilege being introduced.
- **Why the whitelist closes the most dangerous vector on its own:** SVG (a common image-upload XSS vector, since SVG can embed `<script>`) is not in the 4-format whitelist, and the canvas decode step (`<img>` → `drawImage`) would refuse to rasterize it even if a file claimed to be SVG by extension — browsers don't treat SVG as a canvas-drawable raster source the way JPEG/PNG/WEBP are. This isn't incidental — it's the same "re-encode through a trusted library" mitigation OWASP recommends, already structurally present in this codebase's existing `processImage` precedent.
- **Rate/volume**: unlike the Students-import feature, this isn't subject to Firebase Auth's 100-accounts/hour ceiling (no new Auth accounts are created by photo edits) — the relevant constraint is Firestore's per-document write and the shared daily quota, both already covered by the existing role-gated write rule (only two admin roles can trigger this at all) and the 60,000-character cap keeping each individual write small.

---

## Implementation Order

1. **Shared utility** — `src/lib/imageUpload.ts` (`processPhotoUpload`, magic-byte sniffing, `PhotoValidationError`). No UI yet; unit-testable in isolation.
2. **Data model** — `UserPhotoDocument` type, `EnrollmentRegistrationDocument.student.photoDataUrl`, `AuditEventType`'s new `'photo_change'` member (`src/lib/firebase.ts`).
3. **Firestore rules** — new `users/{uid}/photo/{photoId}` match block, extended `activity_log` create rule, extended `isValidRegistrationStudent` (`hasOnly` + new clause), new `isValidPhotoDataUrl` helper. Deploy before any client code that depends on it (mirrors this project's established "rules before dependent code" convention from the Students-import feature).
4. **`StudentForm.tsx` / `TeacherForm.tsx`** — photo field, preview, upload/replace/remove, folded into the existing `writeBatch`, plus the two log writes.
5. **`AdminCreateUserForm.tsx`** — optional photo input, post-creation Firestore write + best-effort Auth `photoURL` sync, folded into the existing rollback path.
6. **Registration form + `ConvertToAccountsPanel.tsx`** — optional student-step photo input; carry-over write + Auth sync on conversion.
7. **`AuthContext.tsx`** — new `photoUrl` field, populated alongside the existing profile fetch.
8. **`Navbar.tsx` / `TopHeader.tsx`** — switch from `user.photoURL` to `AuthContext`'s new `photoUrl`.
9. **`profile/index.tsx`** — wire the existing photo `<img>` slot to a live `getDoc`.
10. **`list/students/index.tsx` / `list/teachers/index.tsx`** — bounded per-page photo fetch/cache for the existing `<img>` slot.

---

## Testing / Manual QA Plan

Static checks after each step (per this project's standing workflow): `npx tsc -b`, `npx eslint <changed files>`, `npx vitest run`, `npm run build`.

Manual QA (after full implementation, in the browser — same as every other UI feature this session):

1. Upload a valid JPEG/PNG/WEBP to a student via the edit modal as `institution_admin` — confirm preview, save, and that `list/students`' table thumbnail updates on next page view.
2. Attempt to select a non-whitelisted file type (e.g. a renamed `.txt` or `.gif`) — confirm client-side rejection with a clear message, before any network write.
3. Attempt to upload a file with a spoofed extension (e.g. a `.exe` renamed to `.jpg`) — confirm the magic-byte check rejects it.
4. Remove an existing photo as `institution_admin` — confirm it reverts to the fallback avatar everywhere (table, edit modal, profile page).
5. Confirm a `senior_teacher`/`regular_teacher` session does **not** see the upload/replace/remove controls in the edit modal (role gate), and that a direct Firestore write attempt from that role is rejected by rules.
6. Create a new account via `AdminCreateUserForm.tsx` with a photo attached — confirm the Firestore photo doc exists immediately, and (best-effort) check the Firebase Console's Authentication tab for that user's `Photo URL`.
7. Submit the public registration form with a student photo, then run it through "Convert to Accounts" — confirm the resulting student account's photo matches what was submitted at registration, without a second upload.
8. Confirm the affected account's own Profile page activity timeline shows "Updated profile photo" after an admin-initiated change, and that the institution's Audit Log page shows the corresponding `photo_change` entry with the correct admin attribution.
9. Confirm Navbar/TopHeader avatars reflect a just-uploaded photo after a page refresh (post-`AuthContext` wiring).

---

## Explicitly Out of Scope

- Self-service photo editing (students/teachers editing their own photo) — admin-only in v1, per explicit decision.
- Photos on `ParentForm.tsx`/`InstitutionAdminForm.tsx`/other role edit modals beyond Student and Teacher.
- Photos on report cards / PDF exports (`ReportCardPDF.tsx` etc.) — would require an on-demand fetch at generation time under the "never denormalize" decision; not requested.
- Photo history/versioning — `users/{uid}/photo/current` is always overwritten, no past-photo retention.
- Any Firebase Storage migration — explicitly base64-in-Firestore per the project owner's stated choice; revisit only if this spec's size/list-cost mitigations prove insufficient in practice.
