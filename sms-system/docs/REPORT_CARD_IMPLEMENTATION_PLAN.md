# Report Card Feature — Implementation Plan

> **Created:** 2026-06-13 · **Branch:** `post-mvp-additions`
> **Spec reference:** `REPORT_CARD_SPEC.md` · `REPORT_GENERATION.md`
> **Status:** Planning — no code changes made yet.

---

## Table of Contents

1. [Current State](#1-current-state)
2. [Key Architectural Decision: Image Storage](#2-key-architectural-decision-image-storage)
3. [Phase 1 — Institution Foundation (19 steps)](#3-phase-1--institution-foundation)
4. [Phase 2 — Report Card Generation (16 steps)](#4-phase-2--report-card-generation)
5. [Firebase Security Rules — Full Additions](#5-firebase-security-rules--full-additions)
6. [Notes and Disclaimers](#6-notes-and-disclaimers)

---

## 1. Current State

### Already done

| Item | File | Notes |
|---|---|---|
| `COMMENT_KEY` constant | `src/lib/commentKey.ts` | 20-item array; correct |
| `SubjectDocument` with `cwWeight`/`examWeight` | `src/lib/firebase.ts` | Type declared; SubjectForm writes both |
| `ResultDocument` with `assessmentType` | `src/lib/firebase.ts` | `'coursework' \| 'exam'`; ResultForm enforces |
| `FeedbackCommentDocument` with `conductGrade`/`commentNumber` | `src/lib/firebase.ts` | Both declared; FeedbackCommentForm enforces |
| Partial `InstitutionDocument` brand fields | `src/lib/firebase.ts` | `motto`, `phone`, `email`, `address`, `brandColor`, `logoUrl` present |
| `/institution-profile` route | `src/App.tsx` | Route registered but renders read-only display page, not wizard |
| General Attendance Register | existing scene | Complete |
| Subject Attendance Register | existing scene | Complete |
| Academic Calendar | existing scene | Complete |

### Not done — Phase 1 (all items)

- `profileComplete`, `authorizedSignature`, four comment labels missing from `InstitutionDocument`
- Institution Profile Wizard (6-step) — existing page is read-only display only
- `PendingInstitutionProfileCard` + sidebar badge
- `HouseDocument`, `StudentActivityDocument`, `StudentResponsibilityDocument`, `ReportCardCommentDocument` types
- Houses collection + list page + detail page
- Student field extensions (`institutionStudentId`, `dateOfBirth`, `houseId`, `houseName`) on type + UI
- Student detail page — entirely hardcoded placeholder, no Firestore wiring
- Create-user page student extensions
- Extra Curricular Activities, Positions of Responsibilities, Section Comments sections
- Bulk class comments view (`/report-card-comments`)
- Sidebar updates for `institution_admin`

### Not done — Phase 2 (all items)

- `ReportCardDocument`, `AttendanceSummaryDocument` types
- `attendanceSummaries` collection + write logic + migration utility
- `generateReportCard.ts`, `reportCardUtils.ts`
- `ReportCardPDF.tsx`, `ReportCardPDFModal.tsx`
- `/report-cards` page + route
- Sidebar: remove "Reports", add "Report Cards" + "Bulk Comments"

---

## 2. Key Architectural Decision: Image Storage

### Spec vs. codebase reality

The spec (`REPORT_CARD_SPEC.md §3.1`) calls for **Firebase Storage** for logo and signature images. However, Firebase Storage is **not configured anywhere in the codebase** — `getStorage` is not imported in any file, and the existing `BrandForm.tsx` stores logos as **canvas-resized base64 data URLs** written directly to the Firestore `institutions/{id}` document.

### Chosen approach: extend the existing canvas/dataURL pattern

**Reason:** Firebase Storage requires a Blaze (pay-as-you-go) plan upgrade and CORS configuration. The project currently uses neither. The canvas approach already works for the logo (resized to max 512 px, ~30–80 KB), is simpler to implement, and data URLs embed cleanly into `@react-pdf/renderer` `<Image>` components without any CORS concerns.

**Trade-off:** Full-resolution source images are discarded. Institution admins cannot download the original upload. This is acceptable for a report card logo.

**Implication for `authorizedSignature`:** The same canvas approach applies. Signature images are resized to a maximum width of 300 px before being stored as data URLs.

**Storage fields on `InstitutionDocument`:**
```typescript
logoUrl?: string;           // data URL (base64); replaces Firebase Storage URL
authorizedSignature?: {
  mode: 'image' | 'text';
  imageUrl?: string;        // data URL (base64)
  text?: string;            // max 30 chars; used when mode === 'text'
};
```

**If Firebase Storage is desired in future:** Swap the data URL fields for Storage URLs. The report card generation and PDF components only care that `logoUrl` is a string resolvable by `<Image src={...} />`; no other changes are needed.

---

## 3. Phase 1 — Institution Foundation

### Step 1 — Extend TypeScript types in `firebase.ts`

**File:** `src/lib/firebase.ts`

Add to `InstitutionDocument`:

```typescript
export type AuthorizedSignature = {
  mode: 'image' | 'text';
  imageUrl?: string;   // base64 data URL
  text?: string;       // max 30 chars
};

export type InstitutionDocument = {
  // ... existing fields ...
  profileComplete?: boolean;
  authorizedSignature?: AuthorizedSignature;
  classSupervisorLabel?: string;
  gradeSupervisorLabel?: string;
  principalLabel?: string;
  vicePrincipalLabel?: string;
};
```

Add to `UserDocument`:

```typescript
export type UserDocument = {
  // ... existing fields ...
  institutionStudentId?: string | null;
  dateOfBirth?: string | null;          // ISO "YYYY-MM-DD"
  houseId?: string | null;
  houseName?: string | null;
};
```

Add new types:

```typescript
export type HouseDocument = {
  institutionId: string;
  name: string;
  description?: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
};

export type StudentActivityDocument = {
  institutionId: string;
  studentId: string;
  classId: string;
  termId: string;
  academicYearId: string;
  activityName: string;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
};

export type StudentResponsibilityDocument = {
  institutionId: string;
  studentId: string;
  classId: string;
  termId: string;
  academicYearId: string;
  title: string;
  organisation: string | null;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt: Timestamp;
};

export type ReportCardCommentDocument = {
  institutionId: string;
  studentId: string;
  termId: string;
  academicYearId: string;
  classSupervisorComment: string;
  gradeSupervisorComment: string;
  principalComment: string;
  vicePrincipalComment: string;
  updatedAt: Timestamp;
  updatedBy: string;
};
```

---

### Step 2 — Institution Profile Wizard

**File:** `src/scenes/(dashboard)/institution-profile/index.tsx`  
**Action:** Replace the existing read-only display page entirely with a 6-step wizard.  
**Access:** `institution_admin` only (enforce via route guard in `App.tsx`).

#### State structure

```typescript
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

type WizardData = {
  name: string;
  motto: string;
  phone: string;
  email: string;
  address: string;
  logoDataUrl: string | null;       // base64 after canvas processing
  signatureMode: 'image' | 'text';
  signatureDataUrl: string | null;  // base64 after canvas processing
  signatureText: string;
  classSupervisorLabel: string;
  gradeSupervisorLabel: string;
  principalLabel: string;
  vicePrincipalLabel: string;
};
```

#### Image processing helper (reuse from BrandForm pattern)

```typescript
function processImage(file: File, maxPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      const fmt = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(fmt, fmt === 'image/jpeg' ? 0.82 : undefined));
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image.')); };
    img.src = objectUrl;
  });
}
```

Call with `maxPx=512` for logo, `maxPx=300` for signature image.

#### Step content outline

| Step | Fields | Validation |
|---|---|---|
| 1 | `name` (required, min 1), `motto` (optional, max 200) | Zod inline |
| 2 | `phone` (optional), `email` (optional, email format), `address` (optional, max 300) | Zod inline |
| 3 | Logo upload (JPG/PNG/WEBP/SVG, max 2 MB); preview shown before Next | `file.size <= 2_097_152`; mime check |
| 4 | Signature mode toggle (Image / Text); if Image: upload (max 1 MB); if Text: input max 30 chars | Size + mime for image mode |
| 5 | Four label inputs with defaults pre-filled; all optional (fallback to default if cleared) | max 50 chars each |
| 6 | Read-only review of all data; "Save Institution Profile" button | — |

#### Save logic (Step 6)

```typescript
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const saveProfile = async () => {
  setSaving(true);
  try {
    await updateDoc(doc(db, 'institutions', institutionId), {
      name:    data.name,
      motto:   data.motto || null,
      phone:   data.phone || null,
      email:   data.email || null,
      address: data.address || null,
      logoUrl: data.logoDataUrl || null,
      authorizedSignature: data.signatureMode === 'image'
        ? { mode: 'image', imageUrl: data.signatureDataUrl }
        : { mode: 'text',  text:     data.signatureText || null },
      classSupervisorLabel: data.classSupervisorLabel || 'Class Supervisor',
      gradeSupervisorLabel: data.gradeSupervisorLabel || 'Grade Supervisor',
      principalLabel:       data.principalLabel       || 'Principal',
      vicePrincipalLabel:   data.vicePrincipalLabel   || 'Vice Principal',
      profileComplete: true,
    });
    refreshProfile(); // from useAuth() — re-fetches institution into context
    navigate('/');    // back to dashboard
  } catch (e) {
    setError('Failed to save. Please try again.');
  } finally {
    setSaving(false);
  }
};
```

> **Note:** The existing `/institution-profile` route in `App.tsx` already maps to this component. No route change needed in this step. The existing read-only display page for non-admin roles (`senior_teacher`, `regular_teacher`, `student`, `parent`) uses a **separate** sidebar link (`/institution-profile`) — after the wizard is built this is a conflict. Resolve by either: (a) using the same route with role-based rendering (wizard for `institution_admin`, display for others), or (b) changing non-admin link to `/institution-info`. Option (a) is simpler — recommended.

---

### Step 3 — `PendingInstitutionProfileCard` + Sidebar Badge

**New file:** `src/components/PendingInstitutionProfileCard.tsx`

```tsx
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

const PendingInstitutionProfileCard = () => {
  const { institution } = useAuth();
  if (institution?.profileComplete) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4 flex flex-col gap-2">
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
        Institution profile incomplete
      </p>
      <p className="text-xs text-amber-700 dark:text-amber-400">
        Complete your institution profile to enable report card generation.
      </p>
      <NavLink
        to="/institution-profile"
        className="self-start text-xs font-medium text-amber-800 dark:text-amber-300 underline"
      >
        Complete profile →
      </NavLink>
    </div>
  );
};

export default PendingInstitutionProfileCard;
```

**Modified file:** `src/scenes/(dashboard)/institution-admin/index.tsx`  
Import and render `<PendingInstitutionProfileCard />` near the top of the institution_admin dashboard.

**Sidebar badge:** In `Menu.tsx`, the "Institution Profile" entry for `institution_admin` needs a dot indicator when `profileComplete !== true`. Because `menuItems` is a static array outside the component, the badge must be rendered in the `NavLink` render function using `useAuth`:

```tsx
// In Menu component, after role check:
const { institution } = useAuth();
const profileIncomplete = institution && !institution.profileComplete;

// In the render for "Institution Profile" item:
<span className="hidden lg:block">{item.label}</span>
{item.href === '/institution-profile' && profileIncomplete && (
  <span className="ml-auto h-2 w-2 rounded-full bg-amber-400" />
)}
```

---

### Step 4 — Houses Firestore Rules

Publish to Firebase Console. Add inside the existing `rules_version = '2'` block:

```javascript
match /houses/{houseId} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId);

  allow create, update: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(
         request.resource != null
           ? request.resource.data.institutionId
           : resource.data.institutionId
       );

  allow delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(resource.data.institutionId);
}
```

---

### Step 5 — Houses List Page

**New file:** `src/scenes/(dashboard)/list/houses/index.tsx`

Follow the same pattern as existing list pages (`/list/terms`, `/list/departments`): `onSnapshot` subscription filtered by `institutionId`, a table with Name + Description + Student Count columns, create/edit/delete via inline form or modal.

**Key behaviours:**
- Create: `addDoc(collection(db, 'houses'), { institutionId, name, description, createdAt: serverTimestamp(), createdBy: uid, updatedAt: serverTimestamp() })`
- Delete: warn if any students have `houseId` pointing to this house (query `users` where `houseId == houseId`). On confirm, batch-clear `houseId: null, houseName: null` on all affected students before deleting the house document.

**Student count column:** Query `users` where `institutionId == institutionId && houseId == house.id` and display count. Or denormalize `studentCount` onto the house document (simpler for display, requires updating on each student assignment change). Recommend live count via a separate query per house on mount — acceptable for institutions with ≤50 houses.

**Route to add in `App.tsx`:**
```tsx
<Route path="/list/houses" element={<HousesListPage />} />
```

---

### Step 6 — House Detail Page

**New file:** `src/scenes/(dashboard)/list/houses/[id]/index.tsx`

Sections:
1. **House info** — name, description; edit in-place.
2. **Assigned students** — `onSnapshot` on `users` where `houseId == id && institutionId == institutionId`. Table with student name, class, student ID.
3. **Manage Students panel** — triggered by a "Manage Students" button. Loads all students in the institution. Shows a checkbox list: checked = currently in this house. On save:

```typescript
const saveAssignments = async (
  toAdd: string[],
  toRemove: string[],
  houseName: string,
  houseId: string
) => {
  const batch = writeBatch(db);
  toAdd.forEach((uid) => {
    batch.update(doc(db, 'users', uid), { houseId, houseName });
  });
  toRemove.forEach((uid) => {
    batch.update(doc(db, 'users', uid), { houseId: null, houseName: null });
  });
  await batch.commit();
};
```

> **One house per student:** When adding a student who already belongs to another house, the update overwrites their `houseId`/`houseName` automatically. The UI should note this: "This student is currently in House X — assigning them here will remove them from House X."

**Route:**
```tsx
<Route path="/list/houses/:id" element={<HouseDetailPage />} />
```

---

### Step 7 — Create-User Page: Student Extensions

**File:** `src/scenes/(dashboard)/create-user/index.tsx`

When the selected role is `'student'`, add two fields to the form:

```typescript
// Zod schema additions (student role branch):
dateOfBirth: z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth is required (YYYY-MM-DD).')
  .refine((v) => !isNaN(Date.parse(v)), 'Invalid date.'),
institutionStudentId: z.string().max(50).optional(),
```

- `dateOfBirth`: required for student role. Render as `<input type="date" />`. Store as `YYYY-MM-DD` string.
- `institutionStudentId`: optional. Before writing to Firestore, check uniqueness:

```typescript
if (institutionStudentId) {
  const q = query(
    collection(db, 'users'),
    where('institutionId', '==', institutionId),
    where('institutionStudentId', '==', institutionStudentId),
    where('role', '==', 'student'),
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    setError('institutionStudentId', { message: 'This student ID is already in use.' });
    return;
  }
}
```

Write both fields alongside existing student fields in `addDoc`.

---

### Step 8 — Student Detail Page (Full Rewrite)

**File:** `src/scenes/(dashboard)/list/students/[id]/index.tsx`  
**Action:** Full rewrite. The current file is entirely hardcoded with no Firestore wiring.

#### Data fetching

```typescript
const { id } = useParams<{ id: string }>();
const { institutionId, role, institution } = useAuth();

// Student document
const [student, setStudent] = useState<UserDocument & { uid: string } | null>(null);
useEffect(() => {
  if (!id) return;
  return onSnapshot(doc(db, 'users', id), (snap) => {
    if (snap.exists()) setStudent({ uid: snap.id, ...snap.data() } as UserDocument & { uid: string });
  });
}, [id]);

// Terms (for selector in activity/comment sections)
const [terms, setTerms] = useState<{ id: string; name: string }[]>([]);
useEffect(() => {
  if (!institutionId) return;
  return onSnapshot(
    query(collection(db, 'terms'), where('institutionId', '==', institutionId)),
    (snap) => setTerms(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })))
  );
}, [institutionId]);

const [selectedTermId, setSelectedTermId] = useState('');
```

#### Student info card

Display: `student.name`, `student.dateOfBirth`, `student.institutionStudentId`, `student.classId`, `student.houseName`, `student.status`, `student.phone`, `student.email`.

For `institution_admin`: show an edit panel for `institutionStudentId`, `dateOfBirth`, and house assignment.

#### House assignment (institution_admin only)

```tsx
// Houses dropdown
const [houses, setHouses] = useState<{ id: string; name: string }[]>([]);
useEffect(() => {
  if (!institutionId) return;
  return onSnapshot(
    query(collection(db, 'houses'), where('institutionId', '==', institutionId)),
    (snap) => setHouses(snap.docs.map((d) => ({ id: d.id, name: d.data().name as string })))
  );
}, [institutionId]);

const assignHouse = async (houseId: string | null) => {
  const houseName = houseId ? houses.find((h) => h.id === houseId)?.name ?? null : null;
  await updateDoc(doc(db, 'users', id!), { houseId, houseName });
};
```

---

### Step 9 — Extra Curricular Activities Section

Add to the student detail page (institution_admin only, below the student info card).

**Firestore writes:**

```typescript
// Add activity
await addDoc(collection(db, 'studentActivities'), {
  institutionId,
  studentId: id,
  classId: student.classId ?? '',
  termId: selectedTermId,
  academicYearId: /* derive from selected term's academicYearId */,
  activityName: activityName.trim(),
  createdAt: serverTimestamp(),
  createdBy: user!.uid,
  updatedAt: serverTimestamp(),
});

// Delete activity
await deleteDoc(doc(db, 'studentActivities', activityId));
```

**Firestore read:**

```typescript
useEffect(() => {
  if (!id || !selectedTermId) return;
  return onSnapshot(
    query(
      collection(db, 'studentActivities'),
      where('studentId', '==', id),
      where('termId', '==', selectedTermId),
    ),
    (snap) => setActivities(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
  );
}, [id, selectedTermId]);
```

**Note:** `academicYearId` must be derived from the selected term. Fetch the term document to get its `academicYearId` field when the term selector changes.

---

### Step 10 — Positions of Responsibilities Section

Same pattern as Step 9. Collection: `studentResponsibilities`.

```typescript
// Add position
await addDoc(collection(db, 'studentResponsibilities'), {
  institutionId,
  studentId: id,
  classId: student.classId ?? '',
  termId: selectedTermId,
  academicYearId: /* derive */,
  title: title.trim(),
  organisation: organisation.trim() || null,
  createdAt: serverTimestamp(),
  createdBy: user!.uid,
  updatedAt: serverTimestamp(),
});
```

Display: `"${title}${organisation ? ` — ${organisation}` : ''}"`

---

### Step 11 — Section Comments on Student Detail Page

**Entry Point 1.** Add a "Report Card Comments" section to the student detail page (institution_admin only).

Four textarea fields labelled with institution's configured labels (fallback to defaults):

```typescript
const labels = {
  classSupervisor: institution?.classSupervisorLabel ?? 'Class Supervisor',
  gradeSupervisor: institution?.gradeSupervisorLabel ?? 'Grade Supervisor',
  principal:       institution?.principalLabel       ?? 'Principal',
  vicePrincipal:   institution?.vicePrincipalLabel   ?? 'Vice Principal',
};
```

**Upsert on save:**

```typescript
const saveComments = async (comments: {
  classSupervisorComment: string;
  gradeSupervisorComment: string;
  principalComment: string;
  vicePrincipalComment: string;
}) => {
  const q = query(
    collection(db, 'reportCardComments'),
    where('studentId', '==', id),
    where('termId', '==', selectedTermId),
    where('institutionId', '==', institutionId),
  );
  const snap = await getDocs(q);
  const payload = {
    ...comments,
    institutionId,
    studentId: id,
    termId: selectedTermId,
    academicYearId: /* derive from term */,
    updatedAt: serverTimestamp(),
    updatedBy: user!.uid,
  };
  if (snap.empty) {
    await addDoc(collection(db, 'reportCardComments'), payload);
  } else {
    await updateDoc(snap.docs[0].ref, payload);
  }
};
```

---

### Step 12 — Bulk Class Comments View

**New file:** `src/scenes/(dashboard)/report-card-comments/index.tsx`

**Route:** `/report-card-comments` (institution_admin only)

#### UI layout

1. **Selectors row:** Class dropdown + Term dropdown.
2. **Students table:** One row per student in the selected class. Columns: Student Name, four dot indicators (filled = green, empty = grey).
3. **Expandable inline panel:** Click a row to expand it inline — shows four labelled textarea fields pre-loaded with existing comments for that student+term. Clicking another row closes the first.

#### Data loading

```typescript
// Students in selected class
const [students, setStudents] = useState<{ uid: string; name: string }[]>([]);
useEffect(() => {
  if (!selectedClassId || !institutionId) return;
  return onSnapshot(
    query(collection(db, 'users'),
      where('institutionId', '==', institutionId),
      where('role', '==', 'student'),
      where('classId', '==', selectedClassId),
    ),
    (snap) => setStudents(snap.docs.map((d) => ({ uid: d.id, name: d.data().name as string }))),
  );
}, [selectedClassId, institutionId]);

// All reportCardComments for selected class + term (one query, not N per student)
const [allComments, setAllComments] = useState<Record<string, ReportCardCommentDocument>>({});
useEffect(() => {
  if (!selectedTermId || !institutionId || students.length === 0) return;
  return onSnapshot(
    query(collection(db, 'reportCardComments'),
      where('institutionId', '==', institutionId),
      where('termId', '==', selectedTermId),
    ),
    (snap) => {
      const map: Record<string, ReportCardCommentDocument> = {};
      snap.docs.forEach((d) => { map[d.data().studentId as string] = d.data() as ReportCardCommentDocument; });
      setAllComments(map);
    },
  );
}, [selectedTermId, institutionId, students]);
```

> **Free-tier note:** Loading all `reportCardComments` for a term with one query (instead of per-student) keeps read counts low. For a class of 40 students, this is 1 query returning ≤40 docs, not 40 individual reads.

**Route registration in `App.tsx`:**
```tsx
<Route path="/report-card-comments" element={<ReportCardCommentsPage />} />
```

---

### Step 13 — Sidebar Updates (Phase 1)

**File:** `src/components/Menu.tsx`

Add to the `PEOPLE` or a new `ADMIN` section:

```typescript
// In the relevant section's items array:
{
  icon: '/profile.png',
  label: 'Institution Profile',
  href: '/institution-profile',
  visible: ['institution_admin'],
},
{
  icon: '/class.png',
  label: 'Houses',
  href: '/list/houses',
  visible: ['institution_admin'],
},
```

Remove the existing `Institution Info` entry for non-admin roles OR leave it pointing to the same `/institution-profile` route with role-based rendering (see Step 2 note). Recommended: keep the entry, render wizard for `institution_admin`, read-only display for others.

Add "Bulk Comments" to the OUTCOMES section:

```typescript
{
  icon: '/message.png',
  label: 'Bulk Comments',
  href: '/report-card-comments',
  visible: ['institution_admin'],
},
```

Add the badge rendering logic as described in Step 3.

---

## 4. Phase 2 — Report Card Generation

> **Do not begin any Phase 2 step until all Phase 1 steps are complete AND the following prerequisites are confirmed:**
> - SubjectForm wiring (`cwWeight`, `examWeight`, `teacherIds`, `classIds`) — **already done**
> - `assessmentType` on ResultForm — **already done**
> - `conductGrade` + `commentNumber` on FeedbackCommentForm — **already done**
> - General Attendance Register — **already done**
> - All Phase 1 steps above — **not yet done**

---

### Step 14 — New TypeScript Types for Phase 2

**File:** `src/lib/firebase.ts`

```typescript
export type ReportCardSubjectRow = {
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  cwWeight: number;
  examWeight: number;
  cwGrade: number | null;
  examGrade: number | null;
  finalGrade: number;
  letterGrade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'F';
  subjectPosition: number | null;
  conductGrade: 'G' | 'S' | 'F' | 'U' | 'P' | 'D' | null;
  commentNumber: number | null;
};

export type ReportCardDocument = {
  studentId: string;
  studentName: string;
  institutionStudentId: string | null;
  dateOfBirth: string | null;
  classId: string;
  className: string;
  classPopulation: number;
  houseId: string | null;
  houseName: string | null;
  termId: string;
  termName: string;
  academicYearId: string;
  academicYearName: string;
  nextTermStart: string | null;
  institutionId: string;
  institutionName: string;
  institutionMotto: string | null;
  institutionAddress: string | null;
  institutionPhone: string | null;
  institutionEmail: string | null;
  institutionLogoUrl: string | null;
  authorizedSignature: AuthorizedSignature | null;
  classSupervisorLabel: string;
  gradeSupervisorLabel: string;
  principalLabel: string;
  vicePrincipalLabel: string;
  classSupervisorComment: string;
  gradeSupervisorComment: string;
  principalComment: string;
  vicePrincipalComment: string;
  totalPossibleSessions: number;
  sessionsAbsent: number;
  daysLate: number;
  extraCurricularActivities: string[];
  positionsOfResponsibility: { title: string; organisation: string | null }[];
  gradingSystem: GradingSystem;
  subjects: ReportCardSubjectRow[];
  studentAverage: number | null;
  classAverage: number | null;
  classRank: number | null;
  gpa: number | null;
  demerits: number | null;
  suspensions: number | null;
  detentions: number | null;
  generatedAt: Timestamp;
  generatedBy: string;
  generatedByRole: string;
  generatedViaBatch: boolean;
};

export type AttendanceSummaryDocument = {
  studentId: string;
  termId: string;
  academicYearId: string;
  institutionId: string;
  classId: string;
  P: number;
  A: number;
  L: number;
  S: number;
  E: number;
  totalExpectedSessions: number;
  filledSessions: number;
  sessionsAbsent: number;
  daysLate: number;
  attendanceRate: number;
  updatedAt: Timestamp;
};
```

---

### Step 15 — `attendanceSummaries` Write Logic

**When to write:** After every successful save to `generalAttendance`, upsert one `attendanceSummaries` document per student whose record changed.

**Document ID:** `${studentId}_${termId}` — deterministic, enables `setDoc` with merge instead of query-then-update.

**Write pattern (add to GeneralAttendanceRegister save handler):**

```typescript
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';

const upsertAttendanceSummary = async (
  studentId: string,
  termId: string,
  academicYearId: string,
  institutionId: string,
  classId: string,
  allRecordsForStudent: { state: 'P' | 'A' | 'L' | 'S' | 'E' }[],
  totalExpectedSessions: number,
) => {
  const counts = { P: 0, A: 0, L: 0, S: 0, E: 0 };
  allRecordsForStudent.forEach((r) => { counts[r.state]++; });
  const sessionsAbsent = counts.A + counts.S + counts.E;
  const attendanceRate = totalExpectedSessions > 0
    ? ((counts.P + counts.L) / totalExpectedSessions) * 100
    : 0;

  await setDoc(
    doc(db, 'attendanceSummaries', `${studentId}_${termId}`),
    {
      studentId, termId, academicYearId, institutionId, classId,
      P: counts.P, A: counts.A, L: counts.L, S: counts.S, E: counts.E,
      totalExpectedSessions,
      filledSessions: allRecordsForStudent.length,
      sessionsAbsent,
      daysLate: counts.L,
      attendanceRate,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};
```

> **How `totalExpectedSessions` is derived:** From the Academic Calendar — count all school days (session pairs AM+PM) in the term for the class. This is already computed by the general attendance register to show expected session counts. Extract that computation into a shared utility and call it here too.

#### One-time migration utility

When `attendanceSummaries` is first deployed, existing `generalAttendance` documents must be aggregated. Build a "Rebuild Attendance Summaries" admin action accessible only to `institution_admin`:

```typescript
// Fetch all generalAttendance docs for institutionId
const allRegisterDocs = await getDocs(
  query(collection(db, 'generalAttendance'),
    where('institutionId', '==', institutionId))
);

// Group by studentId + termId
const grouped: Record<string, typeof allRegisterDocs.docs> = {};
allRegisterDocs.docs.forEach((d) => {
  const data = d.data();
  Object.entries(data.records as Record<string, { state: string }>).forEach(([studentId, rec]) => {
    const key = `${studentId}_${data.termId}`;
    // accumulate state counts per key
  });
});

// Write attendanceSummaries documents for each key
```

This can be a simple button in a settings panel (e.g., the institution admin dashboard) that runs once and shows a progress count.

---

### Step 16 — `reportCardUtils.ts`

**New file:** `src/lib/reportCardUtils.ts`

```typescript
export type LetterGrade = 'A+' | 'A' | 'B+' | 'B' | 'C' | 'F';

export function letterGrade(score: number): LetterGrade {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  return 'F';
}

export function gpaPoints(grade: LetterGrade): number {
  if (grade === 'A+' || grade === 'A') return 4;
  if (grade === 'B+' || grade === 'B') return 3;
  if (grade === 'C') return 2;
  return 0;
}

export function computeGPA(subjects: { finalGrade: number }[]): number | null {
  if (subjects.length === 0) return null;
  const total = subjects.reduce((sum, s) => sum + gpaPoints(letterGrade(s.finalGrade)), 0);
  return Math.round((total / subjects.length) * 100) / 100;
}

export function computeCWGrade(
  results: { assessmentType: 'coursework' | 'exam'; score: number; maxScore: number }[]
): number | null {
  const cw = results.filter((r) => r.assessmentType === 'coursework');
  if (cw.length === 0) return null;
  return cw.reduce((sum, r) => sum + (r.score / r.maxScore) * 100, 0) / cw.length;
}

export function computeExamGrade(
  results: { assessmentType: 'coursework' | 'exam'; score: number; maxScore: number }[]
): number | null {
  const exam = results.filter((r) => r.assessmentType === 'exam');
  if (exam.length === 0) return null;
  return exam.reduce((sum, r) => sum + (r.score / r.maxScore) * 100, 0) / exam.length;
}

export function computeFinalGrade(
  cwGrade: number | null,
  examGrade: number | null,
  cwWeight: number,
  examWeight: number,
): number {
  const cw   = (cwGrade   ?? 0) * (cwWeight   / 100);
  const exam = (examGrade ?? 0) * (examWeight / 100);
  return Math.round((cw + exam) * 10) / 10;
}

// Returns 1-based rank. Lower rank = higher score.
export function computeRanks(scores: { id: string; score: number }[]): Record<string, number> {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const ranks: Record<string, number> = {};
  sorted.forEach((s, i) => { ranks[s.id] = i + 1; });
  return ranks;
}

export function nextTermStart(
  currentTermNumber: number | undefined,
  currentAcademicYearId: string,
  allTerms: { id: string; termNumber?: number; academicYearId?: string; startDate: string; status: string }[]
): string | null {
  if (currentTermNumber !== undefined) {
    const next = allTerms.find(
      (t) => t.academicYearId === currentAcademicYearId && t.termNumber === currentTermNumber + 1
    );
    if (next) return next.startDate;
  }
  // Fallback: first term of next academic year
  const upcoming = allTerms
    .filter((t) => t.academicYearId !== currentAcademicYearId && (t.status === 'upcoming' || t.status === 'active'))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return upcoming[0]?.startDate ?? null;
}
```

---

### Step 17 — `generateReportCard.ts`

**New file:** `src/lib/generateReportCard.ts`

High-level flow:

```typescript
import {
  collection, doc, getDoc, getDocs, query, where,
  addDoc, updateDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  computeCWGrade, computeExamGrade, computeFinalGrade,
  letterGrade, computeGPA, computeRanks, nextTermStart,
} from './reportCardUtils';

export type GenerateOptions = {
  studentId: string;
  termId: string;
  institutionId: string;
  generatedBy: string;
  generatedByRole: string;
  generatedViaBatch?: boolean;
  // Provided externally when batch-generating to avoid N×class-rank queries
  existingClassReportCards?: ReportCardDocument[];
};

export type GenerateResult =
  | { ok: true; docId: string; warnings: string[] }
  | { ok: false; error: string };

export async function generateReportCard(opts: GenerateOptions): Promise<GenerateResult> {
  const warnings: string[] = [];

  // 1. Load institution
  const instSnap = await getDoc(doc(db, 'institutions', opts.institutionId));
  if (!instSnap.exists()) return { ok: false, error: 'Institution not found.' };
  const inst = instSnap.data();
  if (!inst.profileComplete) return { ok: false, error: 'Institution profile is incomplete. Complete it before generating report cards.' };

  // 2. Load student
  const studentSnap = await getDoc(doc(db, 'users', opts.studentId));
  if (!studentSnap.exists()) return { ok: false, error: 'Student not found.' };
  const student = studentSnap.data();

  // 3. Load term
  const termSnap = await getDoc(doc(db, 'terms', opts.termId));
  if (!termSnap.exists()) return { ok: false, error: 'Term not found.' };
  const term = termSnap.data();

  // 4. Load academic year
  const yearSnap = term.academicYearId
    ? await getDoc(doc(db, 'academicYears', term.academicYearId))
    : null;
  const academicYear = yearSnap?.data();

  // 5. Load attendance summary
  const attSnap = await getDoc(doc(db, 'attendanceSummaries', `${opts.studentId}_${opts.termId}`));
  if (!attSnap.exists()) {
    warnings.push('Attendance summary not found. Sessions will show as 0. Run "Rebuild Summaries" from the admin dashboard.');
  }
  const att = attSnap.data() ?? { totalExpectedSessions: 0, sessionsAbsent: 0, daysLate: 0 };

  // 6. Load results
  const resultsSnap = await getDocs(query(
    collection(db, 'results'),
    where('studentId', '==', opts.studentId),
    where('termId', '==', opts.termId),
    where('institutionId', '==', opts.institutionId),
  ));
  const results = resultsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (results.length === 0) return { ok: false, error: 'No results found for this student in the selected term.' };

  // 7. Load feedback comments
  const feedbackSnap = await getDocs(query(
    collection(db, 'feedback_comments'),
    where('studentId', '==', opts.studentId),
    where('termId', '==', opts.termId),
    where('institutionId', '==', opts.institutionId),
  ));
  const feedbackBySubject: Record<string, { conductGrade: string; commentNumber: number }> = {};
  feedbackSnap.docs.forEach((d) => {
    feedbackBySubject[d.data().subjectId as string] = {
      conductGrade: d.data().conductGrade as string,
      commentNumber: d.data().commentNumber as number,
    };
  });

  // 8. Derive unique subjects from results
  const subjectIds = [...new Set(results.map((r) => r.subjectId as string))];

  // 9. Load subjects (for cwWeight, examWeight, name, teacherIds)
  const subjectDocs: Record<string, { name: string; cwWeight: number; examWeight: number; teacherIds: string[]; teacherNames: string[] }> = {};
  await Promise.all(subjectIds.map(async (sid) => {
    const snap = await getDoc(doc(db, 'subjects', sid));
    if (snap.exists()) subjectDocs[sid] = snap.data() as typeof subjectDocs[string];
  }));

  // 10. Compute per-subject grades
  const subjectRows: ReportCardSubjectRow[] = [];
  for (const sid of subjectIds) {
    const subj = subjectDocs[sid];
    if (!subj) continue;
    if (subj.cwWeight === undefined || subj.examWeight === undefined) {
      warnings.push(`Subject "${subj.name}" is missing Course Work / Exam weighting.`);
    }
    const subjectResults = results.filter((r) => r.subjectId === sid);
    const cwGrade   = computeCWGrade(subjectResults as any);
    const examGrade = computeExamGrade(subjectResults as any);
    const finalGrade = computeFinalGrade(cwGrade, examGrade, subj.cwWeight ?? 50, subj.examWeight ?? 50);
    const fb = feedbackBySubject[sid];
    if (!fb) warnings.push(`No feedback comment found for subject "${subj.name}".`);
    subjectRows.push({
      subjectId: sid,
      subjectName: subj.name,
      teacherId: subj.teacherIds?.[0] ?? '',
      teacherName: subj.teacherNames?.[0] ?? '',
      cwWeight: subj.cwWeight ?? 50,
      examWeight: subj.examWeight ?? 50,
      cwGrade,
      examGrade,
      finalGrade,
      letterGrade: letterGrade(finalGrade),
      subjectPosition: null, // computed below
      conductGrade: (fb?.conductGrade as any) ?? null,
      commentNumber: fb?.commentNumber ?? null,
    });
  }

  // 11. Subject positions (requires fetching all students' results per subject — deferred to batch flow)
  // For single-student generation: set to null; note in warnings
  // For batch generation: caller provides pre-computed positions

  // 12. Load section comments
  const commentsSnap = await getDocs(query(
    collection(db, 'reportCardComments'),
    where('studentId', '==', opts.studentId),
    where('termId', '==', opts.termId),
    where('institutionId', '==', opts.institutionId),
  ));
  const comments = commentsSnap.docs[0]?.data() ?? {};

  // 13. Load activities and responsibilities
  const activitiesSnap = await getDocs(query(
    collection(db, 'studentActivities'),
    where('studentId', '==', opts.studentId),
    where('termId', '==', opts.termId),
  ));
  const responsibilitiesSnap = await getDocs(query(
    collection(db, 'studentResponsibilities'),
    where('studentId', '==', opts.studentId),
    where('termId', '==', opts.termId),
  ));

  // 14. Load classmates for class rank / class average (from existing reportCards for this class+term)
  const classCardsSnap = opts.existingClassReportCards
    ?? (await getDocs(query(
      collection(db, 'reportCards'),
      where('classId', '==', student.classId),
      where('termId', '==', opts.termId),
      where('institutionId', '==', opts.institutionId),
    ))).docs.map((d) => d.data() as ReportCardDocument);

  const studentAverage = subjectRows.length > 0
    ? subjectRows.reduce((s, r) => s + r.finalGrade, 0) / subjectRows.length
    : null;
  const classmates = classCardsSnap.filter((c) => c.studentId !== opts.studentId);
  const classAverage = classmates.length > 0
    ? (() => {
        const all = [...classmates.map((c) => c.studentAverage ?? 0), studentAverage ?? 0];
        return all.reduce((s, v) => s + v, 0) / all.length;
      })()
    : null;
  const classRank = studentAverage !== null && classmates.length > 0
    ? classmates.filter((c) => (c.studentAverage ?? 0) > studentAverage).length + 1
    : null;

  // 15. Load all terms for next-term derivation
  const allTermsSnap = await getDocs(query(
    collection(db, 'terms'), where('institutionId', '==', opts.institutionId)
  ));
  const allTerms = allTermsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // 16. Class population
  const classmatesSnap = await getDocs(query(
    collection(db, 'users'),
    where('institutionId', '==', opts.institutionId),
    where('classId', '==', student.classId),
    where('role', '==', 'student'),
  ));

  // 17. Assemble document
  const payload: Omit<ReportCardDocument, 'generatedAt'> & { generatedAt: ReturnType<typeof serverTimestamp> } = {
    studentId: opts.studentId,
    studentName: student.name as string,
    institutionStudentId: student.institutionStudentId ?? null,
    dateOfBirth: student.dateOfBirth ?? null,
    classId: student.classId ?? '',
    className: student.className ?? '',
    classPopulation: classmatesSnap.size,
    houseId: student.houseId ?? null,
    houseName: student.houseName ?? null,
    termId: opts.termId,
    termName: term.name as string,
    academicYearId: term.academicYearId ?? '',
    academicYearName: academicYear?.name ?? '',
    nextTermStart: nextTermStart(term.termNumber, term.academicYearId, allTerms as any),
    institutionId: opts.institutionId,
    institutionName: inst.name as string,
    institutionMotto: inst.motto ?? null,
    institutionAddress: inst.address ?? null,
    institutionPhone: inst.phone ?? null,
    institutionEmail: inst.email ?? null,
    institutionLogoUrl: inst.logoUrl ?? null,
    authorizedSignature: inst.authorizedSignature ?? null,
    classSupervisorLabel: inst.classSupervisorLabel ?? 'Class Supervisor',
    gradeSupervisorLabel: inst.gradeSupervisorLabel ?? 'Grade Supervisor',
    principalLabel:       inst.principalLabel       ?? 'Principal',
    vicePrincipalLabel:   inst.vicePrincipalLabel   ?? 'Vice Principal',
    classSupervisorComment: (comments.classSupervisorComment as string) ?? '',
    gradeSupervisorComment: (comments.gradeSupervisorComment as string) ?? '',
    principalComment:       (comments.principalComment as string)       ?? '',
    vicePrincipalComment:   (comments.vicePrincipalComment as string)   ?? '',
    totalPossibleSessions: att.totalExpectedSessions as number,
    sessionsAbsent: att.sessionsAbsent as number,
    daysLate: att.daysLate as number,
    extraCurricularActivities: activitiesSnap.docs.map((d) => d.data().activityName as string),
    positionsOfResponsibility: responsibilitiesSnap.docs.map((d) => ({
      title: d.data().title as string,
      organisation: (d.data().organisation as string | null) ?? null,
    })),
    gradingSystem: (inst.gradingSystem as GradingSystem) ?? 'flat',
    subjects: subjectRows.sort((a, b) => a.subjectName.localeCompare(b.subjectName)),
    studentAverage,
    classAverage,
    classRank,
    gpa: subjectRows.length > 0 ? computeGPA(subjectRows) : null,
    demerits: null,
    suspensions: null,
    detentions: null,
    generatedAt: serverTimestamp(),
    generatedBy: opts.generatedBy,
    generatedByRole: opts.generatedByRole,
    generatedViaBatch: opts.generatedViaBatch ?? false,
  };

  // 18. Upsert
  const existingSnap = await getDocs(query(
    collection(db, 'reportCards'),
    where('studentId', '==', opts.studentId),
    where('termId', '==', opts.termId),
    where('institutionId', '==', opts.institutionId),
  ));
  let docId: string;
  if (existingSnap.empty) {
    const ref = await addDoc(collection(db, 'reportCards'), payload);
    docId = ref.id;
  } else {
    await updateDoc(existingSnap.docs[0].ref, payload);
    docId = existingSnap.docs[0].id;
  }

  return { ok: true, docId, warnings };
}
```

---

### Step 18 — `ReportCardPDF.tsx`

**New file:** `src/components/reportCard/ReportCardPDF.tsx`

Uses `@react-pdf/renderer` (already installed). Four pages = four PDF panels.

```tsx
import {
  Document, Page, View, Text, Image, StyleSheet, Font,
} from '@react-pdf/renderer';
import { COMMENT_KEY } from '@/lib/commentKey';
import type { ReportCardDocument } from '@/lib/firebase';

const styles = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, padding: 24, color: '#1a1a1a' },
  coverPage: { fontFamily: 'Helvetica', fontSize: 10, padding: 24, color: '#1a1a1a',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 },
  heading: { fontSize: 18, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  subheading: { fontSize: 11, textAlign: 'center', color: '#444' },
  logo: { width: 80, height: 80, objectFit: 'contain' },
  table: { width: '100%', marginTop: 8 },
  tableRow: { flexDirection: 'row', borderBottom: '0.5pt solid #ccc', paddingVertical: 3 },
  tableHeader: { backgroundColor: '#e0f2fe', fontFamily: 'Helvetica-Bold' },
  cell: { flex: 1, fontSize: 8, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 12, marginBottom: 4,
    borderBottom: '1pt solid #1d4ed8', paddingBottom: 2, color: '#1d4ed8' },
  printNote: { position: 'absolute', bottom: 12, left: 24, right: 24,
    fontSize: 7, color: '#aaa', textAlign: 'center' },
});

const PRINT_NOTE = 'Print double-sided (flip on short edge) and fold vertically to form pamphlet.';

interface Props { data: ReportCardDocument; }

export const ReportCardPDF = ({ data }: Props) => (
  <Document>
    {/* Page 1 — Front Cover */}
    <Page size="A4" style={styles.coverPage}>
      {data.institutionLogoUrl && (
        <Image src={data.institutionLogoUrl} style={styles.logo} />
      )}
      <Text style={styles.heading}>{data.institutionName}</Text>
      {data.institutionMotto && <Text style={styles.subheading}>{data.institutionMotto}</Text>}
      <Text style={[styles.subheading, { marginTop: 16 }]}>Student's Report Card</Text>
      <Text style={{ fontSize: 13, marginTop: 8 }}>{data.studentName}</Text>
      <Text style={{ fontSize: 10, color: '#555' }}>{data.termName}</Text>
      <Text style={{ fontSize: 10, color: '#555' }}>{data.academicYearName}</Text>
      <Text style={styles.printNote}>{PRINT_NOTE}</Text>
    </Page>

    {/* Page 2 — Inner Left: Summary + Attendance */}
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionTitle}>Student Summary</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
        {[
          ['Academic Year', data.academicYearName],
          ['Term', data.termName],
          ['Class', data.className],
          ['Date of Birth', data.dateOfBirth ?? '—'],
          ['Student ID', data.institutionStudentId ?? '—'],
          ['House', data.houseName ?? '—'],
          ['GPA', data.gpa?.toFixed(2) ?? '—'],
          ['Class Rank', data.classRank ? `${data.classRank} / ${data.classPopulation}` : '—'],
          ['Student Average', data.studentAverage ? `${data.studentAverage.toFixed(1)}%` : '—'],
          ['Class Average', data.classAverage ? `${data.classAverage.toFixed(1)}%` : '—'],
        ].map(([label, value]) => (
          <View key={label} style={{ width: '48%', flexDirection: 'row', gap: 4, marginBottom: 2 }}>
            <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8, width: 90 }}>{label}:</Text>
            <Text style={{ fontSize: 8 }}>{value}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Attendance Sessions</Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Text style={{ fontSize: 8 }}>Total Possible: {data.totalPossibleSessions}</Text>
        <Text style={{ fontSize: 8 }}>Absent: {data.sessionsAbsent}</Text>
        <Text style={{ fontSize: 8 }}>Late: {data.daysLate}</Text>
      </View>

      {data.extraCurricularActivities.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Extra Curricular Activities</Text>
          {data.extraCurricularActivities.map((a, i) => (
            <Text key={i} style={{ fontSize: 8 }}>• {a}</Text>
          ))}
        </>
      )}

      {data.positionsOfResponsibility.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Positions of Responsibility</Text>
          {data.positionsOfResponsibility.map((p, i) => (
            <Text key={i} style={{ fontSize: 8 }}>
              • {p.title}{p.organisation ? ` — ${p.organisation}` : ''}
            </Text>
          ))}
        </>
      )}
      <Text style={styles.printNote}>{PRINT_NOTE}</Text>
    </Page>

    {/* Page 3 — Inner Right: Subjects Table + Comments + Key to Comments */}
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionTitle}>Subjects</Text>
      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeader]}>
          {['Subject', `CW (${/* example */50}%)`, `Exam (${50}%)`, 'Final', 'Grade', 'Pos', 'Cond', 'Teacher', '#'].map((h) => (
            <Text key={h} style={styles.cell}>{h}</Text>
          ))}
        </View>
        {data.subjects.map((s, i) => (
          <View key={s.subjectId} style={[styles.tableRow, i % 2 === 1 ? { backgroundColor: '#f8fafc' } : {}]}>
            <Text style={styles.cell}>{s.subjectName}</Text>
            <Text style={styles.cell}>{s.cwGrade !== null ? `${s.cwGrade.toFixed(1)}` : '—'}</Text>
            <Text style={styles.cell}>{s.examGrade !== null ? `${s.examGrade.toFixed(1)}` : '—'}</Text>
            <Text style={styles.cell}>{s.finalGrade.toFixed(1)}</Text>
            <Text style={styles.cell}>{s.letterGrade}</Text>
            <Text style={styles.cell}>{s.subjectPosition ?? '—'}</Text>
            <Text style={styles.cell}>{s.conductGrade ?? '—'}</Text>
            <Text style={styles.cell}>{s.teacherName}</Text>
            <Text style={styles.cell}>{s.commentNumber ?? '—'}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Comments</Text>
      {[
        [data.classSupervisorLabel, data.classSupervisorComment],
        [data.gradeSupervisorLabel, data.gradeSupervisorComment],
        [data.principalLabel, data.principalComment],
        [data.vicePrincipalLabel, data.vicePrincipalComment],
      ].map(([label, comment]) => (
        <View key={label} style={{ marginBottom: 6 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 8 }}>{label}:</Text>
          <Text style={{ fontSize: 8, color: comment ? '#111' : '#aaa' }}>{comment || '—'}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Key to Comments</Text>
      {COMMENT_KEY.map((text, i) => (
        <Text key={i} style={{ fontSize: 7, marginBottom: 1 }}>{i + 1}. {text}</Text>
      ))}
      <Text style={styles.printNote}>{PRINT_NOTE}</Text>
    </Page>

    {/* Page 4 — Back Cover: Keys + Next Term + Signature */}
    <Page size="A4" style={styles.page}>
      <Text style={styles.sectionTitle}>Key to Letter Grades</Text>
      {[['A+','95–100%'],['A','85–94%'],['B+','75–84%'],['B','65–74%'],['C','50–64%'],['F','0–49%']].map(([g, r]) => (
        <Text key={g} style={{ fontSize: 8 }}>{g}: {r}</Text>
      ))}

      <Text style={styles.sectionTitle}>Key to Conduct</Text>
      {[['G','Good'],['S','Satisfactory'],['F','Fair'],['U','Unsatisfactory'],['P','Poor'],['D','Disruption']].map(([c, m]) => (
        <Text key={c} style={{ fontSize: 8 }}>{c} — {m}</Text>
      ))}

      <Text style={styles.sectionTitle}>Next Term Begins</Text>
      <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold' }}>
        {data.nextTermStart
          ? new Date(data.nextTermStart).toLocaleDateString('en-JM', { year: 'numeric', month: 'long', day: 'numeric' })
          : 'To be announced'}
      </Text>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Authorized Signature</Text>
      {data.authorizedSignature?.mode === 'image' && data.authorizedSignature.imageUrl && (
        <Image src={data.authorizedSignature.imageUrl} style={{ width: 120, height: 40, objectFit: 'contain' }} />
      )}
      {data.authorizedSignature?.mode === 'text' && (
        <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Oblique' }}>{data.authorizedSignature.text}</Text>
      )}
      {!data.authorizedSignature && (
        <Text style={{ fontSize: 8, color: '#aaa' }}>No signature configured.</Text>
      )}

      <Text style={styles.printNote}>{PRINT_NOTE}</Text>
    </Page>
  </Document>
);
```

> **Column header widths:** The CW/Exam column headers above use placeholder `50%` values. Update these to render the actual `cwWeight`/`examWeight` from the first subject row, or use static "CW" / "Exam" if weights differ per subject.
>
> **Date locale:** `'en-JM'` uses Jamaican English date formatting. Adjust if multi-country support is added.

---

### Step 19 — `ReportCardPDFModal.tsx`

**New file:** `src/components/reportCard/ReportCardPDFModal.tsx`

```tsx
import { Suspense, lazy } from 'react';
import { PDFViewer, PDFDownloadLink } from '@react-pdf/renderer';
import type { ReportCardDocument } from '@/lib/firebase';
const ReportCardPDF = lazy(() =>
  import('./ReportCardPDF').then((m) => ({ default: m.ReportCardPDF }))
);

interface Props {
  data: ReportCardDocument;
  onClose: () => void;
}

const ReportCardPDFModal = ({ data, onClose }: Props) => (
  <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
    <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white text-sm">
      <span>Report Card — {data.studentName} · {data.termName}</span>
      <div className="flex items-center gap-3">
        <Suspense fallback={<span className="text-gray-400 text-xs">Preparing…</span>}>
          <PDFDownloadLink
            document={<ReportCardPDF data={data} />}
            fileName={`report-card-${data.studentName.replace(/,?\s+/g, '-')}-${data.termName.replace(/\s+/g, '-')}.pdf`}
            className="text-sky-400 hover:underline text-xs"
          >
            {({ loading }) => loading ? 'Preparing…' : 'Download PDF'}
          </PDFDownloadLink>
        </Suspense>
        <button onClick={onClose} className="text-gray-300 hover:text-white px-2">✕ Close</button>
      </div>
    </div>
    <div className="flex-1">
      <Suspense fallback={<div className="flex items-center justify-center h-full text-white text-sm">Loading PDF renderer…</div>}>
        <PDFViewer width="100%" height="100%" showToolbar={false}>
          <ReportCardPDF data={data} />
        </PDFViewer>
      </Suspense>
    </div>
  </div>
);

export default ReportCardPDFModal;
```

---

### Step 20 — `/report-cards` Page

**New file:** `src/scenes/(dashboard)/report-cards/index.tsx`

Key sections:
1. **Table:** `onSnapshot` on `reportCards` filtered by `institutionId` (or `studentId` for student role, parent-linked for parent).
2. **Generate panel** (institution_admin only): student dropdown + term dropdown + "Generate" button calling `generateReportCard`.
3. **Batch generate panel** (institution_admin only): scope selector (class / cohort) + class dropdown + term dropdown + "Batch Generate" button that loops sequentially.
4. **Per-row actions:** "PDF" button (opens `ReportCardPDFModal`), "Re-generate" button (calls `generateReportCard` again).

**Role-scoped query:**

```typescript
let q;
if (role === 'student') {
  q = query(collection(db, 'reportCards'),
    where('institutionId', '==', institutionId),
    where('studentId', '==', user!.uid));
} else if (role === 'parent') {
  // fetch student IDs from student_parents collection, then query
} else {
  q = query(collection(db, 'reportCards'),
    where('institutionId', '==', institutionId));
}
```

**Batch generate loop:**

```typescript
const batchGenerate = async (studentIds: string[], termId: string) => {
  setProgress({ done: 0, total: studentIds.length, errors: [] });
  for (const studentId of studentIds) {
    const result = await generateReportCard({
      studentId, termId, institutionId, generatedBy: user!.uid,
      generatedByRole: role!, generatedViaBatch: true,
    });
    setProgress((p) => ({
      done: p.done + 1,
      total: p.total,
      errors: result.ok ? p.errors : [...p.errors, `${studentId}: ${result.error}`],
    }));
  }
};
```

**Route in `App.tsx`:**
```tsx
<Route path="/report-cards" element={<ReportCardsPage />} />
```

---

### Step 21 — Sidebar Phase 2 Updates

**File:** `src/components/Menu.tsx`

Remove:
```typescript
{ icon: '/result.png', label: 'Reports', href: '/reports', visible: [...all roles...] },
```

Add to OUTCOMES:
```typescript
{
  icon: '/result.png',
  label: 'Report Cards',
  href: '/report-cards',
  visible: ['super_admin','institution_admin','senior_teacher','regular_teacher','student','parent'],
},
```

Remove `/reports` route from `App.tsx`.

---

## 5. Firebase Security Rules — Full Additions

Publish these alongside their respective Phase 1/2 steps. Add inside the existing top-level `match /databases/{database}/documents` block.

### Phase 1 rules

```javascript
// houses
match /houses/{houseId} {
  allow read: if request.auth != null && isInstitutionMember(resource.data.institutionId);
  allow create, update: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(
         request.resource != null ? request.resource.data.institutionId : resource.data.institutionId
       );
  allow delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(resource.data.institutionId);
}

// studentActivities
match /studentActivities/{id} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId)
    && (isAdminOrAbove() || isTeacherOrAbove()
        || resource.data.studentId == request.auth.uid
        || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId))));
  allow create, update, delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(
         request.resource != null ? request.resource.data.institutionId : resource.data.institutionId
       );
}

// studentResponsibilities (identical pattern to studentActivities)
match /studentResponsibilities/{id} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId)
    && (isAdminOrAbove() || isTeacherOrAbove()
        || resource.data.studentId == request.auth.uid
        || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId))));
  allow create, update, delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(
         request.resource != null ? request.resource.data.institutionId : resource.data.institutionId
       );
}

// reportCardComments (institution_admin + super_admin read only)
match /reportCardComments/{id} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId)
    && (callerRole() == 'institution_admin' || callerRole() == 'super_admin');
  allow create, update: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(
         request.resource != null ? request.resource.data.institutionId : resource.data.institutionId
       );
  allow delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(resource.data.institutionId);
}
```

### Phase 2 rules

```javascript
// reportCards
match /reportCards/{id} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId)
    && (callerRole() == 'institution_admin' || callerRole() == 'super_admin'
        || isTeacherOrAbove()
        || resource.data.studentId == request.auth.uid
        || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId))));
  allow create, update: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(request.resource.data.institutionId);
  allow delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(resource.data.institutionId);
}

// attendanceSummaries
match /attendanceSummaries/{id} {
  allow read: if request.auth != null
    && isInstitutionMember(resource.data.institutionId)
    && (callerRole() == 'institution_admin' || callerRole() == 'super_admin'
        || isTeacherOrAbove()
        || resource.data.studentId == request.auth.uid
        || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId))));
  allow create, update: if request.auth != null
    && isInstitutionMember(request.resource.data.institutionId)
    && (callerRole() == 'institution_admin' || callerRole() == 'senior_teacher');
  allow delete: if request.auth != null
    && callerRole() == 'institution_admin'
    && isInstitutionMember(resource.data.institutionId);
}

// Disable old reports collection after Phase 2 cleanup
match /reports/{docId} {
  allow read, write: if false;
}
```

---

## 6. Notes and Disclaimers

### Firestore free tier (Spark plan)

| Operation | Free quota | Risk area |
|---|---|---|
| Reads | 50,000/day | Report card generation: ~10–20 reads per student. A batch of 40 students = ~800 reads. Well within quota for normal usage. |
| Writes | 20,000/day | Each report card generation = 1 write + N `attendanceSummaries` writes. Migration utility may spike writes — run during off-hours. |
| Document size | 1 MB max | `ReportCardDocument` with 20 subjects + 4 comments ≈ 5–15 KB. Safe. |

### Image storage (data URLs in Firestore)

The logo and signature are stored as base64 data URLs on the institution document. The canvas resize (512 px max) keeps each image to ~30–80 KB. Both together stay well under the 1 MB document limit. If the institution's document approaches 900 KB, consider upgrading to Firebase Storage (Blaze plan) and storing URLs instead.

### `attendanceSummaries` migration

The migration utility (Step 15) reads all `generalAttendance` documents for the institution at once. For an institution with 3 terms × 40 classes × 180 school days × 2 sessions = potentially thousands of documents. This may be slow client-side. Run it once per institution, warn the admin it may take several seconds, and show a progress indicator. It does not need to be re-run unless data is corrupted.

### Class Rank / Subject Position accuracy

Class Rank and Subject Position are only accurate if all students in the class have had report cards generated (or are being generated in the same batch). For single-student generation, these fields are computed from whatever `reportCards` documents already exist for the class. A note is shown in the UI: _"Use batch generation for accurate comparative rankings."_

### `super_admin` on report cards list page

The `onSnapshot` query filters by `institutionId`. When `institutionId === '*'` (super admin), the query will fail or return no results. This is a known limitation (same as the existing `/reports` page). Either skip the subscription for super_admin (show a "Select an institution" prompt), or implement a collection-group query. Deferring to match existing behaviour.

### Student name format

The spec calls for `"Surname, Forename"` format on the report card (`studentName` field). The `UserDocument` stores `name` as a single string. Either:
- (a) Store first/last separately on `UserDocument` (schema change); or
- (b) Use the existing `name` field as-is on the report card.

Recommend **(b)** for now — no schema change needed, the report card just shows whatever is in `name`. If surname-first ordering is required, add `firstName`/`lastName` fields to `UserDocument` as a separate task.

### PDF table overflow

If a student is enrolled in many subjects (>15), Page 3 (Inner Right) may overflow a single A4 page. `@react-pdf/renderer` handles overflow by adding pages automatically when content extends beyond the page boundary. The Key to Comments section, placed after the table, will flow onto the next page naturally — no special handling needed.

### Re-running the wizard (editing profile data)

After first completion (`profileComplete: true`), the wizard route (`/institution-profile`) should still render for institution_admin so they can update branding. Pre-populate all fields from the current institution document. The "Save" button calls `updateDoc` (same as first save) and does not reset `profileComplete`.

### Deferred items (not in scope for this plan)

- Disciplinary Action data (demerits, suspensions, detentions) — placeholder `null` in schema
- Subject attendance on report card — deferred
- Report card versioning / issuance workflow (draft vs. issued state)
- Retroactive batch edit for `dateOfBirth` / `institutionStudentId`
- `super_admin` cross-institution report card visibility

---

*End of implementation plan.*
