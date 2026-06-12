# Attendance Register — Phase 1 Post-Implementation Review

**Date:** 2026-06-11  
**Status:** Phase 1 complete. This document records spec/plan corrections needed and the ordered backlog of remaining work.

---

## 1. What Should Be Updated

### 1.1 `ATTENDANCE_REGISTER_SPEC.md`

#### Status header
The file header still reads `Status: Planning complete — Phase 1 implementation pending`. Update to:
```
Status: Phase 1 implementation complete. Phase 2 (Subject Attendance) pending.
```

#### §8 — Firestore Schema — date field types
The spec shows `startDate: Timestamp`, `endDate: Timestamp`, and `date: Timestamp` on `AcademicYearDocument`, `TermDocument`, and `NonSchoolDayDocument`. The implementation uses **`string` (ISO "YYYY-MM-DD")** throughout, consistent with the existing `TermDocument` convention already in `src/lib/firebase.ts`. The spec should be amended with a note:

> **Implementation note:** All date fields in the attendance schema use ISO string format (`"YYYY-MM-DD"`), not Firestore `Timestamp`. This was a deliberate decision to maintain consistency with the existing `TermDocument` date fields. `useInstitutionAcademicCalendar` and all utility functions (`attendanceCalendar.ts`, `attendanceDraft.ts`) use direct string comparison — no `.toDate()` calls.

#### §5.3 — Student view (`/attendance/my`)
The spec describes a two-tab layout: **Tab 1 — General Attendance** (register grid), **Tab 2 — Subject Attendance** (placeholder). The Phase 1 implementation built a single-view page with no tabs. The spec should either:
- Be updated to reflect the single-view approach (no tabs until Phase 2), or
- Remain as-is and the tabs should be added (see §2.2 below).

#### §5.4 — Parent view (`/attendance/child`)
Same situation as §5.3 — spec describes tabs, implementation is single view.

#### §5.1 — Sidebar visibility by role (Academic Calendar)
The spec lists Academic Calendar as visible to `institution_admin` only. The implementation shows it to both `super_admin` and `institution_admin` in both `App.tsx` and `Menu.tsx`. Update the spec to explicitly note that `super_admin` also has access, or correct the code (see §2.5 below).

#### §5.2 — Route access (Subject Register)
The spec lists `/attendance/subject` as accessible to `institution_admin`, `regular_teacher`, `super_admin`. The implementation also grants access to `senior_teacher`. Update the spec to include `senior_teacher`, or correct the route (see §2.5 below).

#### §H2 — Parent-child linking method
Section H2 of the implementation plan says "Get `linkedAccounts` from `useAuth()` (parent's linked child UIDs)." This is incorrect for the actual codebase — `linkedAccounts` is a plain descriptive string, not a UID array. The `ChildAttendancePage` correctly queries the `student_parents` collection (`where('parentId', '==', user.uid)`) to resolve children. The implementation plan should document this:

> **Codebase deviation:** `AuthContext.linkedAccounts` is a single descriptive string, not a UID array. Parent-to-child relationships are stored in the `student_parents` Firestore collection (`{ parentId, studentId }` documents). `ChildAttendancePage` queries this collection rather than parsing `linkedAccounts`.

### 1.2 `ATTENDANCE_REGISTER_IMPLEMENTATION_PLAN.md`

#### Phase 1 step completion markers
All Phase 1 steps (A-1 through K-2) are fully implemented. The plan currently reads as a forward-looking to-do list with no completion markers. Add a `[x]` or `DONE` marker to each completed step, and update the document status header to:
```
Status: Phase 1 complete. Phase 2 steps (P2-1 through P2-7) are pending.
```

---

## 2. What Should Be Done Next

Tasks are ordered by priority and dependency. Firebase Console actions must be done before the feature is testable in production.

---

### Priority 1 — Firebase Console deployments (blocking, no code changes needed)

These are **not code changes** — they must be applied manually in the Firebase Console. The feature will silently fail in production without them.

#### 1a. Deploy security rules
Copy the three new rule blocks from `sms-system/docs/firebase-rules.md` into the Firebase Console (Firestore → Rules):

- **`academicYears`** collection — read: `isAdminOrAbove`, write: `isAdminOrAbove && writingToMyInstitution`  
- **`nonSchoolDays`** collection — read: `isSignedIn && sameInstitution`, write: `isAdminOrAbove && writingToMyInstitution`  
- **`generalAttendance`** collection — read rules by role (senior_teacher, institution_admin/super_admin, student own class, parent via student_parents), write: `isSeniorTeacher && writingToMyInstitution`

The full rule text with before/after context is in `firebase-rules.md`.

#### 1b. Create composite Firestore index
The live `onSnapshot` query in `GeneralAttendanceRegisterPage` and the overdue detection query in the admin dashboard both filter on multiple fields. Without this index, Firestore will throw an error in production.

**Collection:** `generalAttendance`  
**Index fields (all Ascending):**
1. `institutionId` ASC  
2. `classId` ASC  
3. `date` ASC  
4. `session` ASC  

**How to create:** Firebase Console → Firestore → Indexes → Composite → Add index.

---

### Priority 2 — Minor UI gaps

These are straightforward changes that address deviations from the spec.

#### 2.1 Add tabbed layout to MyAttendancePage and ChildAttendancePage

**Files:**
- `src/scenes/(dashboard)/attendance/my/index.tsx`
- `src/scenes/(dashboard)/attendance/child/index.tsx`

**Change:** Wrap the existing content in a Tab 1 ("General Attendance"). Add a Tab 2 ("Subject Attendance") with a static message:
> "Subject-level attendance will be available in a future release."

This is the layout described in spec §5.3 and §5.4. Use simple tab state (`useState<'general' | 'subject'>`); no router change needed.

#### 2.2 Add role-differentiated message to SubjectAttendancePage

**File:** `src/scenes/(dashboard)/attendance/subject/index.tsx`

**Change:** Read `role` from `useAuth()`. For `institution_admin`, append an additional paragraph:
> "Subject Attendance is a Phase 2 feature. Once enabled, you will be able to view and manage subject-level registers for all teachers."

For all other roles, keep the existing generic message.

#### 2.3 Add dismiss button to senior teacher overdue banner

**File:** `src/scenes/(dashboard)/senior-teacher/index.tsx`

**Change:** The current overdue banner is non-dismissable. Add a local `useState<boolean>` (`dismissed`) and render a `×` button in the top-right corner of the banner. Set `dismissed = true` on click; the banner does not re-appear until the next page load (session-only dismissal, no persistence needed).

```tsx
const [dismissed, setDismissed] = useState(false);
// In JSX:
{!dismissed && overdueSlots.length > 0 && (
  <div className="...">
    <span>...</span>
    <button onClick={() => setDismissed(true)}>×</button>
  </div>
)}
```

---

### Priority 3 — Role access alignment

Decide and align on two access discrepancies between the spec and the implementation.

#### 3.1 Academic Calendar — `super_admin` access

**Current:** Both `super_admin` and `institution_admin` can access `/academic-calendar` (in `App.tsx` line 95 and `Menu.tsx` line 125).  
**Spec says:** `institution_admin` only.

**Decision needed:** Should `super_admin` be able to set up the academic calendar for an institution (current behaviour), or should it be read-only oversight via the admin dashboard only?

- If keeping `super_admin` access: Update spec §5.1 and §5.2 to list it explicitly.
- If removing `super_admin` access: Change `App.tsx` line 95 from `role === 'super_admin' || role === 'institution_admin'` to `role === 'institution_admin'`; remove `"super_admin"` from the `visible` array on the Academic Calendar item in `Menu.tsx`.

#### 3.2 Subject Register — `senior_teacher` access

**Current:** `senior_teacher` can access `/attendance/subject` (in `App.tsx` line 99 and `Menu.tsx` line 137).  
**Spec says:** `institution_admin`, `regular_teacher`, `super_admin` only — `senior_teacher` not listed.

The existing Subject Register page is a placeholder. Since it shows no real data and Phase 2 hasn't been designed for `senior_teacher` specifically, the safer choice is to align with the spec until Phase 2 defines the senior teacher's role in subject attendance.

- If removing `senior_teacher` access: Change `App.tsx` line 99 to remove `role === 'senior_teacher'`; remove `"senior_teacher"` from the `visible` array in `Menu.tsx`.

---

### Priority 4 — PDF export improvements

The current `AttendanceScopeModal` and `AttendancePDF` diverge from spec §7.1 and §7.3.

#### 4.1 Add export timestamp to PDF header

**File:** `src/components/attendance/AttendancePDF.tsx`

**Change:** Add an `exportedAt` field to `AttendancePDFData`:
```typescript
exportedAt: string; // e.g. "Jun 11, 2026 at 10:42 AM"
```
Render it as a subtitle line below the date range:
```
Exported: Jun 11, 2026 at 10:42 AM
```
Populate it in `AttendanceScopeModal.generate()`:
```typescript
exportedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
```

#### 4.2 Add page number footer

**File:** `src/components/attendance/AttendancePDF.tsx`

**Change:** Add a `<Page>` `render` prop using `@react-pdf/renderer`'s built-in page numbering:
```tsx
<Page
  ...
  render={({ pageNumber, totalPages }) => (
    <View style={{ position: 'absolute', bottom: 20, right: 30 }}>
      <Text style={{ fontSize: 7, color: '#999' }}>
        Page {pageNumber} of {totalPages}
      </Text>
    </View>
  )}
/>
```

#### 4.3 (Optional) Three-scope selector in AttendanceScopeModal

**File:** `src/components/attendance/AttendanceScopeModal.tsx`

The spec (§7.1, K1) defines three named scopes — **Current week**, **Full term**, **Summary** — where "Summary" would be a totals-only view (one row per student, no daily grid). The current implementation is a flexible date range picker, which is arguably more useful than three fixed scopes.

This is lower priority because the current UX covers the spec's use cases. Address only if the three-scope model is preferred. If keeping the date range approach, update the spec to match.

---

### Priority 5 — Phase 2 prerequisites (Subject Attendance Register)

Phase 2 is blocked on the following prerequisites. Do not begin P2 implementation until these are in place.

**P2-0a — Extend `SubjectDocument` type** (`src/lib/firebase.ts`):
```typescript
frequency?: 'daily' | 'weekly' | 'custom';
sessionDayOfWeek?: number[];   // 0=Sun … 6=Sat
customFrequencyDays?: string[]; // ISO date strings
```

**P2-0b — Extend `SubjectForm`** (`src/components/forms/SubjectForm.tsx`):
Add the frequency and session day fields to the create/edit form. This is the primary blocker — Phase 2 cannot populate `subjectEnrollments` without knowing which days a subject meets.

**P2-0c — Create `subjectEnrollments` Firestore collection** (Firebase Console):
Schema: `{ institutionId, subjectId, studentId, teacherId, termId, classId }`. Enrollment is created when a student is assigned to a subject that has a frequency. Subject Attendance docs will be keyed by this collection.

Once P2-0a through P2-0c are complete, follow steps P2-1 through P2-7 in `ATTENDANCE_REGISTER_IMPLEMENTATION_PLAN.md`.

---

## 3. Known Deviations (Accepted, No Action Needed)

These are intentional divergences from the spec that were made based on codebase constraints or design judgement. No changes required unless the spec is being updated for accuracy.

| Deviation | Spec says | Implementation | Reason |
|---|---|---|---|
| Date field types | `Timestamp` on `AcademicYearDocument`, `TermDocument`, `NonSchoolDayDocument` | `string` ("YYYY-MM-DD") | Consistency with existing `TermDocument` in `firebase.ts` |
| Parent-child linking | `linkedAccounts` UID array from `useAuth()` | `student_parents` collection query | `linkedAccounts` is a plain string in the actual codebase, not a UID array |
| `TermStatus` values | `'upcoming' \| 'active' \| 'closed'` | `'upcoming' \| 'active' \| 'completed'` | Changed in prior session for semantic clarity |
| Scope modal design | Three named scopes (week / term / summary) | Flexible date range + session checkboxes | More flexible for arbitrary date ranges; covers all spec use cases |
| Student/parent view tabs | Two tabs: General + Subject placeholder | Single view, no tabs | Tabs deferred to Phase 2 when Subject Attendance is real |
| Backfill Classes menu item | Not in spec | Added to ATTENDANCE section in `Menu.tsx` | User-requested admin tool for migrating existing student data |
