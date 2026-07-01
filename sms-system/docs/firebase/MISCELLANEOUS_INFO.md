# Codebase Nuances & Reference Notes

Schema, implementation details, and operational notes for all Firestore collections, indexes, free-tier considerations, the activity log and audit log system, and form system design constraints.

---

## Collections

### Quick Reference — All Collections

| Collection | Path | Doc ID | Written by | Purpose |
| --- | --- | --- | --- | --- |
| `institutions` | `institutions/{institutionId}` | Auto-generated | `super_admin` | One document per institution; canonical `institutionId` source |
| `users` | `users/{uid}` | Firebase Auth UID | Auth flow / admin forms | Profile document for every authenticated user (all roles) |
| `teachers` | `teachers/{uid}` | Firebase Auth UID | Admin forms | Role-specific teacher fields (type, department, etc.) |
| `parents` | `parents/{uid}` | Firebase Auth UID | Admin forms | Role-specific parent fields (phone, address) |
| `classes` | `classes/{classId}` | Auto-generated | `institution_admin`, `senior_teacher` | Class/homeroom groups within an institution |
| `subjects` | `subjects/{subjectId}` | Auto-generated | `institution_admin`, `senior_teacher` | Subject definitions with teacher arrays, class scope, weights |
| `terms` | `terms/{termId}` | Auto-generated | `institution_admin` | Academic terms (created via Academic Calendar wizard) |
| `departments` | `departments/{departmentId}` | Auto-generated | `institution_admin` | Teacher departments within an institution |
| `results` | `results/{resultId}` | Auto-generated | `regular_teacher`, `senior_teacher` | Individual student assessment scores (coursework or exam) |
| `feedback_comments` | `feedback_comments/{commentId}` | Dual: auto-generated (`FeedbackCommentForm`) or deterministic `{studentId}_{subjectId}_{termId}` (Gradebook) | `regular_teacher`, `senior_teacher` | Per-student conduct grade + comment per subject per term |
| `lessons` | `lessons/{lessonId}` | Auto-generated | `regular_teacher`, `senior_teacher` | Lesson plan records (stub form — Firestore write not yet wired) |
| `exams` | `exams/{examId}` | Auto-generated | `regular_teacher`, `senior_teacher` | Exam schedule records (stub form — Firestore write not yet wired) |
| `assignments` | `assignments/{assignmentId}` | Auto-generated | `regular_teacher`, `senior_teacher` | Assignment records (stub form — Firestore write not yet wired) |
| `events` | `events/{eventId}` | Auto-generated | `institution_admin` | Institution calendar events (stub form — Firestore write not yet wired) |
| `announcements` | `announcements/{announcementId}` | Auto-generated | `institution_admin` | Institution announcements (stub form — Firestore write not yet wired) |
| `student_parents` | `student_parents/{linkId}` | Auto-generated | Admin forms | Junction: links `parentId` → `studentId` |
| `teacher_classes` | `teacher_classes/{linkId}` | Auto-generated | Admin forms | Junction: links teacher UID → class ID |
| `timetable_slots` | `timetable_slots/{slotId}` | Auto-generated | `institution_admin`, `senior_teacher` | Recurring weekly schedule slots (subject + teacher + class + days + time) |
| `houses` | `houses/{houseId}` | Auto-generated | `institution_admin` | School houses for student grouping; students assigned via `users/{uid}.houseId` |
| `academicYears` | `academicYears/{yearId}` | Auto-generated | `institution_admin` | Academic year definition with school week days and status |
| `nonSchoolDays` | `nonSchoolDays/{dayId}` | Auto-generated | `institution_admin` | Non-school day entries (single dates or ranges) |
| `subjectEnrollments` | `subjectEnrollments/{subjectId}_{classId}` | Deterministic: `{subjectId}_{classId}` | `institution_admin`, `senior_teacher` | Per-class subject enrollment with optional excluded student UIDs |
| `generalAttendance` | `generalAttendance/{docId}` | Auto-generated | `institution_admin`, `senior_teacher` | Daily AM/PM attendance records per class (one doc per class+date+session) |
| `subjectAttendance` | `subjectAttendance/{docId}` | Auto-generated | `regular_teacher`, `institution_admin` | Per-session subject attendance (one doc per subject+class+date) |
| `attendanceSummaries` | `attendanceSummaries/{summaryId}` | Deterministic: `{studentId}_{termId}` | Rebuild utility page | Aggregated attendance totals per student per term |
| `studentActivities` | `studentActivities/{activityId}` | Auto-generated | `institution_admin`, `senior_teacher` | Extra-curricular activities per student per term |
| `studentResponsibilities` | `studentResponsibilities/{responsibilityId}` | Auto-generated | `institution_admin`, `senior_teacher` | Positions of responsibility per student per term |
| `reportCardComments` | `reportCardComments/{commentId}` | Auto-generated | `institution_admin`, `senior_teacher` | Section comments (class supervisor, grade supervisor, principal, vice-principal) per student per term |
| `reportCards` | `reportCards/{cardId}` | Auto-generated | `institution_admin` | Fully denormalized report card snapshot generated at report card time |
| `gradebooks` | `gradebooks/{classId}_{subjectId}_{termId}` | Deterministic: `{classId}_{subjectId}_{termId}` | `institution_admin`, `senior_teacher`, `regular_teacher` | Editable grade grid per class + subject + term |
| `gradebooks/columns` | `gradebooks/{gradebookId}/columns/{columnId}` | Auto-generated | Same write roles as parent `gradebooks` document | Assessment column definitions within a gradebook |

> **Stub forms:** `lessons`, `exams`, `assignments`, `events`, and `announcements` have UI forms that call `console.log` only — no `addDoc`/`updateDoc`. Data written to these collections comes only from seed scripts or manual Firestore Console entry until their forms are wired.
>
> **`attendance` collection (legacy):** Security rules exist for an `attendance` collection in `firebase-rules.md`, but no client-side code writes to or reads from it. This appears to be a superseded collection predating `generalAttendance` and `subjectAttendance`. It has no active data and requires no action.

---

### `institutions` Collection

**Path:** `institutions/{institutionId}`

Top-level collection. Required as a parent path for the `audit_log` subcollection. Readable by all signed-in users — needed to populate the institution name in the audit log filter dropdown on `/admin/audit-log`. Only `super_admin` can create, update, or delete documents.

**Document ID strategy:** Firebase auto-generated IDs. The generated ID becomes the canonical `institutionId` value stored in every `users/{uid}.institutionId` field for members of that institution.

**Document schema:**

```text
institutions/{institutionId}
  name:                   string   // "Anytown Unified School District"
  institutionId:          string   // mirrors the document ID — denormalized for queries
  createdAt:              string   // ISO 8601
  status:                 'active' | 'suspended'
  gradingSystem?:         'flat' | 'weighted'
  location?:              string
  userCount?:             number
  studentCount?:          number
  teacherCount?:          number
  lastActiveAt?:          string
  // Brand fields — all optional; legacy documents without them are valid
  motto?:                 string
  phone?:                 string
  email?:                 string
  address?:               string
  brandColor?:            string   // hex e.g. "#3B82F6"
  logoUrl?:               string   // Firebase Storage download URL
  // Institution profile wizard fields
  profileComplete?:       boolean
  authorizedSignature?:   { mode: 'image' | 'text'; imageUrl?: string; text?: string }
  classSupervisorLabel?:  string
  gradeSupervisorLabel?:  string
  principalLabel?:        string
  vicePrincipalLabel?:    string
```

---

### `institutions/_platform` Sentinel Document

`super_admin` actions that have no institution scope (creating a new institution, platform-level configuration) need a home in the `audit_log` subcollection. A manually created sentinel document with the fixed ID `_platform` serves this purpose.

```text
institutions/_platform
  name:          "Platform"
  institutionId: "_platform"
  createdAt:     <date of creation, ISO 8601>
  status:        "active"
```

This document appears as the "Platform" option in the `super_admin` audit log filter on `/admin/audit-log`. All super_admin actions with no institution scope are written to `institutions/_platform/audit_log/{eventId}`.

> **Note:** The `_platform` sentinel must exist before any super_admin audit writes with no institution scope are attempted. Firestore allows writes to subcollections of non-existent parent documents, but rules may not permit it depending on rule evaluation. Create this document manually in the Firestore Console.

---

### `users` Collection

**Path:** `users/{uid}`

One document per authenticated user, keyed by Firebase Auth UID. The source of truth for role, institution membership, and user profile data.

```text
users/{uid}
  role:                   Role     // 'super_admin' | 'institution_admin' | 'senior_teacher' | 'regular_teacher' | 'student' | 'parent'
  name:                   string
  institutionId:          string
  phone?:                 string
  address?:               string
  status?:                'active' | 'inactive' | 'suspended'
  department?:            string   // department ID; senior_teacher only
  emergencyContact?:      string
  linkedAccounts?:        string
  canGenerateSchedule?:   boolean
  // Senior teacher homeroom
  assignedClassId?:       string | null
  assignedClassName?:     string | null
  // Student class assignment
  classId?:               string | null
  // Student profile extensions
  institutionStudentId?:  string | null
  dateOfBirth?:           string | null   // ISO "YYYY-MM-DD"
  gender?:                'Male' | 'Female' | null
  houseId?:               string | null
  houseName?:             string | null
  // Tour tracking
  toursCompleted?:        Record<string, boolean>   // keyed by tour name; e.g. { institution_admin: true, gradebook: true }
```

**Note:** `email` is not stored in this document — it lives in Firebase Auth only. `name` is denormalized from Auth at account creation.

---

### `teachers` Collection

**Path:** `teachers/{uid}`

Supplementary document for teacher-specific fields, keyed by the same UID as `users/{uid}`. Not every teacher UID has a document here — only those created via `TeacherForm` which writes both `users/{uid}` and `teachers/{uid}`. Used by `SubjectForm`, `TimetableSlotForm`, and the teacher detail page.

```text
teachers/{uid}
  institutionId:  string
  teacherType:    'regular' | 'senior'
  departmentId?:  string
  name:           string   // denormalized from users/{uid}.name for query efficiency
```

---

### `parents` Collection

**Path:** `parents/{uid}`

Supplementary document for parent-specific fields. Keyed by UID, matching `users/{uid}`.

```text
parents/{uid}
  institutionId:  string
  phone?:         string
  address?:       string
```

---

### `classes` Collection

**Path:** `classes/{classId}`

One document per class/homeroom group. Used throughout the app as the primary grouping unit for students, attendance, results, and report cards.

```text
classes/{classId}
  name:             string
  capacity:         number
  grade:            number
  institutionId:    string
  termId:           string
  supervisor?:      string   // free-text display name (not a UID)
  classTeacherId?:  string   // UID — required by isClassTeacherFor() Firestore rule helper
  departmentId?:    string
```

---

### `subjects` Collection

**Path:** `subjects/{subjectId}`

Full subject definition. Teacher and class associations are stored as arrays on this document (not in junction collections) to enable `array-contains` queries and single-document rule checks.

```text
subjects/{subjectId}
  name:                   string
  description?:           string
  institutionId:          string
  classScope:             'institution' | 'class'
  classIds:               string[]   // list of class IDs this subject applies to
  classNames:             string[]   // denormalized
  teacherIds:             string[]   // list of teacher UIDs assigned
  teacherNames:           string[]   // denormalized
  cwWeight:               number     // coursework weight (0–100)
  examWeight:             number     // exam weight (0–100; cwWeight + examWeight == 100)
  createdAt:              Timestamp
  createdBy:              string     // uid
  updatedAt:              Timestamp
  updatedBy:              string     // uid
  frequency?:             'daily' | 'weekly' | 'fortnightly' | 'custom'
  sessionDayOfWeek?:      number[]   // 0=Sun … 6=Sat
  customFrequencyDays?:   string[]
  fortnightlyOffset?:     0 | 1      // which week of the fortnightly cycle has a session
```

**Why arrays-on-document (not a junction collection):** Firestore rules allow only one `get()` call per evaluation. `ResultForm` and `FeedbackCommentForm` check `uid ∈ subjects/{subjectId}.teacherIds` via that single `get()`. A junction collection cannot be queried from within rules. See [Form System — Junction Collections](#junction-collections--subjectform-and-classform).

---

### `terms` Collection

**Path:** `terms/{termId}`

Academic terms created via the Academic Calendar wizard. The active term (if any) is resolved by `useInstitutionAcademicCalendar()` and used by BigCalendar, attendance registers, and report card generation.

```text
terms/{termId}
  name:            string
  institutionId:   string
  startDate:       string   // ISO "YYYY-MM-DD" — always snapped to next Monday
  endDate:         string   // ISO "YYYY-MM-DD"
  status:          'upcoming' | 'active' | 'completed'
  academicYearId?: string
  termNumber?:     1 | 2 | 3
  defaultName?:    string
```

---

### `departments` Collection

**Path:** `departments/{departmentId}`

Teacher departments within an institution.

```text
departments/{departmentId}
  name:             string
  institutionId:    string
  headTeacherId?:   string   // UID of department head; links to teachers/{uid}
```

---

### `results` Collection

**Path:** `results/{resultId}`

Individual student assessment scores. Each result belongs to one student, one subject, one term, and one assessment type.

```text
results/{resultId}
  studentId:      string
  teacherId:      string
  classId:        string
  termId:         string
  institutionId:  string
  departmentId:   string
  subjectId:      string
  assessmentName: string
  assessmentType: 'coursework' | 'exam'
  score:          number
  maxScore:       number
  weight?:        number   // only when institution gradingSystem === 'weighted'
  date?:          string   // ISO "YYYY-MM-DD"
  // Gradebook-linked fields — present only on results written by the Gradebook page
  gradebookColumnId?:  string           // links to gradebooks/{id}/columns/{columnId}
  source?:             'gradebook'      // used by Results list page and generateReportCard to detect the gradebook path
  columnWeight?:       number           // denormalized from the column at write time; re-synced on column weight change
```

**Write rule:** `regular_teacher` write requires `uid ∈ subjects/{subjectId}.teacherIds`.

**Gradebook-linked results:** Results written by the Gradebook page carry `gradebookColumnId`, `source: 'gradebook'`, and `columnWeight`. The Results list page filters these out to avoid duplicates alongside the Gradebook view. `generateReportCard.ts` detects the gradebook path via `source === 'gradebook'` and switches to the B-ii weighted average formula instead of the standard CW/exam pipeline.

---

### `feedback_comments` Collection

**Path:** `feedback_comments/{commentId}`

Per-student conduct grade and teacher comment, scoped to one subject per term. Used in report card generation.

**Document ID strategy:** Two write paths coexist:

- **`FeedbackCommentForm` (standalone form):** Uses `addDoc` — Firestore auto-generates the document ID. Upsert logic queries for an existing document before deciding create vs. update.
- **Gradebook page:** Uses `batch.set()` with a deterministic ID `{studentId}_{subjectId}_{termId}`. This allows `generateReportCard.ts` to read feedback for each student with a single `getDoc` per student per subject rather than a collection query.

> **Important:** `generateReportCard.ts` reads feedback exclusively via the deterministic `getDoc` path. Feedback written through the standalone `FeedbackCommentForm` (auto-generated ID) will not be found by the report card generator unless re-entered via the Gradebook page.

```text
feedback_comments/{commentId}
  studentId:       string
  teacherId:       string
  classId:         string
  termId:          string
  institutionId:   string
  departmentId:    string
  subjectId:       string
  comment:         string
  conductGrade:    'G' | 'S' | 'F' | 'U' | 'P' | 'D'
  commentNumber:   number     // legacy: single index into COMMENT_KEY preset list
  commentNumbers?: number[]   // gradebook path: array of 1–5 COMMENT_KEY indices; replaces commentNumber for new writes
  createdAt:       Timestamp | string
  teacherName?:    string     // denormalized
```

**Backward-compat shim:** Both `FeedbackCommentForm` and `generateReportCard.ts` handle legacy documents by converting a single `commentNumber` to `[commentNumber]` when `commentNumbers` is absent.

**Write rule:** `regular_teacher` write requires `uid ∈ subjects/{subjectId}.teacherIds`. The Gradebook page `batch.set()` with the deterministic ID functions as an upsert without a prior query.

---

### `student_parents` Collection

**Path:** `student_parents/{linkId}`

Junction collection linking parents to their children (students). One document per parent–student pair.

```text
student_parents/{linkId}
  parentId:      string   // UID of the parent user
  studentId:     string   // UID of the student user
  institutionId: string
```

**Query pattern:** `BigCalendar` and `ChildAttendancePage` query by `parentId` to get all children, then fan-out to `users/{studentId}` to resolve each child's `classId`.

---

### `teacher_classes` Collection

**Path:** `teacher_classes/{linkId}`

Junction collection linking teachers to their assigned classes.

```text
teacher_classes/{linkId}
  teacherId:     string
  classId:       string
  institutionId: string
```

---

### `timetable_slots` Collection

**Path:** `timetable_slots/{slotId}`

Recurring weekly schedule slots. Each document describes which days of the week a subject is taught, by whom, at what time, for which class.

```text
timetable_slots/{slotId}
  institutionId:  string
  termId:         string
  termName:       string         // denormalized
  subjectId:      string
  subjectName:    string         // denormalized
  teacherId:      string
  teacherName:    string         // denormalized
  classId:        string         // added in post-mvp-additions branch
  className:      string         // denormalized; added in post-mvp-additions branch
  days:           ('mon' | 'tue' | 'wed' | 'thu' | 'fri')[]
  startTime:      string         // "HH:MM" 24-hour
  duration:       number         // minutes
  room?:          string
  createdBy:      string         // uid
  createdByRole:  string
  createdAt:      Timestamp | string
```

> **Data migration note:** Documents written before the `post-mvp-additions` branch lack `classId`/`className`. These records will not appear in student/parent `BigCalendar` queries (which filter by `classId`) until re-saved via the updated `TimetableSlotForm`. No automated migration was applied.

---

### `houses` Collection

**Path:** `houses/{houseId}`

School houses used for student grouping on report cards. Students are assigned to a house via `users/{uid}.houseId` and `users/{uid}.houseName` (denormalized). Managed via `HousesListPage` and `HouseDetailPage`.

```text
houses/{houseId}
  institutionId:  string
  name:           string
  description?:   string
  createdAt:      Timestamp
  createdBy:      string   // uid
  updatedAt:      Timestamp
```

---

### `academicYears` Collection

**Path:** `academicYears/{yearId}`

One document per academic year per institution. Terms reference the academic year via `termId`. The active academic year is determined by `status === 'active'` and is resolved by `useInstitutionAcademicCalendar()`.

```text
academicYears/{yearId}
  institutionId:    string
  name:             string     // e.g. "2025-2026"
  startDate:        string     // ISO "YYYY-MM-DD"
  endDate:          string     // ISO "YYYY-MM-DD"
  status:           'draft' | 'active' | 'completed'
  schoolWeekDays:   number[]   // [1,2,3,4,5] — Mon=1 … Sat=6
  createdAt:        Timestamp
  confirmedAt?:     string     // ISO datetime; set when institution_admin confirms the year
  confirmedBy?:     string     // uid of confirming institution_admin
```

**Who writes:** `institution_admin` only. Confirmation (status → `'active'`) also written client-side by `institution_admin` in `AcademicCalendarPage`.

---

### `nonSchoolDays` Collection

**Path:** `nonSchoolDays/{dayId}`

Non-school day entries (public holidays, institution closures). Used by `AttendanceWindows` to prevent attendance marking on non-school days.

```text
nonSchoolDays/{dayId}
  institutionId:  string
  academicYearId: string
  type:           'single' | 'range'
  date?:          string   // ISO "YYYY-MM-DD"; when type === 'single'
  startDate?:     string   // ISO "YYYY-MM-DD"; when type === 'range'
  endDate?:       string   // ISO "YYYY-MM-DD"; when type === 'range'
  reason:         string   // max 100 chars
  source:         'public_holiday' | 'institution_specific'
  isActive:       boolean
  createdAt:      Timestamp
```

---

### `subjectEnrollments` Collection

**Path:** `subjectEnrollments/{subjectId}_{classId}`

Per-class enrollment records for a subject. The document ID is deterministic (`{subjectId}_{classId}`), making it safe to `setDoc` without a prior existence check.

```text
subjectEnrollments/{subjectId}_{classId}
  institutionId:    string
  subjectId:        string
  classId:          string
  excludedStudents: string[]   // UIDs of students specifically excluded from this subject
  updatedAt:        Timestamp
  updatedBy:        string     // uid
```

**Why excluded-student model (not enrolled-student model):** Most students in a class take the same subjects. Storing only exclusions is write-efficient and makes "all class students are enrolled" the default.

---

### `generalAttendance` Collection

**Path:** `generalAttendance/{docId}`

One document per class + date + session (AM or PM). Written by the `senior_teacher` assigned as homeroom for the class, or by `institution_admin`. Used by `GeneralAttendanceRegisterPage` to persist and restore attendance state within the active term. The Firestore rule enforces homeroom ownership for senior teachers via a `get()` check against `users/{uid}.assignedClassId`.

**Document schema:**

```text
generalAttendance/{docId}
  institutionId:  string         // for institution-scoped filtering
  classId:        string
  className:      string         // denormalized at save time
  termId:         string         // active term ID at save time
  academicYearId: string         // active year ID at save time
  date:           string         // ISO "YYYY-MM-DD"
  session:        'AM' | 'PM'
  records:        Record<studentId, {
                    state:       'P' | 'A' | 'L' | 'S' | 'E'
                    studentName: string   // denormalized at save time
                    reason?:     string   // max 50 chars; E state only
                  }>
  submittedBy:    string         // uid of last saver
  submittedAt:    Timestamp
  createdAt:      Timestamp      // set on first save only
  updatedAt:      Timestamp      // updated on every save
```

**Doc ID:** Firebase auto-generated. Uniqueness is enforced by query (fetch by `classId + date + session`) rather than a deterministic doc ID. Each save uses `setDoc` with `{ merge: false }` to fully overwrite the session document.

**Who writes:** `senior_teacher` (homeroom class only — Firestore rule checks `assignedClassId == request.resource.data.classId`); `institution_admin` (any class). `regular_teacher` and `super_admin` do not write general attendance.

**Composite index required:**
`institutionId ASC · classId ASC · date ASC · session ASC` — required for both the `GeneralAttendanceRegisterPage` week query and the admin overdue detection query. Must be created manually in the Firebase Console (Collection scope, not Collection Group).

---

### `subjectAttendance` Collection

**Path:** `subjectAttendance/{docId}`

One document per subject + class + session date. There is no AM/PM split — a subject session is a single event on a given day. Written by the `regular_teacher` assigned to the subject, or by `institution_admin`.

**Document schema:**

```text
subjectAttendance/{docId}
  institutionId:  string         // for institution-scoped filtering
  subjectId:      string
  subjectName:    string         // denormalized at save time
  classId:        string
  className:      string         // denormalized at save time
  sessionDate:    string         // ISO "YYYY-MM-DD" — one doc per subject + class + date
  teacherId:      string         // UID of the submitting teacher
  termId:         string         // active term ID at save time
  academicYearId: string         // active year ID at save time
  records:        Record<studentId, {
                    state:       'P' | 'A' | 'L' | 'S' | 'E'
                    studentName: string   // denormalized at save time
                    reason?:     string   // max 50 chars; E state only
                  }>
  submittedBy:    string         // uid of last saver
  submittedAt:    Timestamp
  createdAt:      Timestamp      // set on first save only
  updatedAt:      Timestamp      // updated on every save
```

**Doc ID:** Firebase auto-generated. Each save uses `setDoc` with `{ merge: false }` to fully overwrite the session document, consistent with the `generalAttendance` save pattern.

**Who writes:** `regular_teacher` (subjects they are assigned to — Firestore rule checks `teacherIds` array via a `get()` on the parent `subjects` document); `institution_admin` (any subject).

**Composite index required:**
`institutionId ASC · subjectId ASC · classId ASC · sessionDate ASC` — required for the `SubjectAttendancePage` week query and the per-student subject accordion (P2-6). Must be created manually in the Firebase Console (Collection scope).

---

### `attendanceSummaries` Collection

**Path:** `attendanceSummaries/{summaryId}`

Aggregated attendance totals per student per term. Computed and written by the `RebuildAttendanceSummariesPage` utility — not written incrementally on each attendance save. Used by `generateReportCard.ts` to populate attendance stats on report cards.

```text
attendanceSummaries/{summaryId}
  studentId:              string
  termId:                 string
  academicYearId:         string
  institutionId:          string
  classId:                string
  P:                      number   // present count
  A:                      number   // absent count
  L:                      number   // late count
  S:                      number   // sick count
  E:                      number   // excused count
  totalExpectedSessions:  number
  filledSessions:         number
  sessionsAbsent:         number   // A + L (by convention)
  daysLate:               number   // L count
  attendanceRate:         number   // 0–100 percentage
  updatedAt:              Timestamp
```

**Document ID strategy:** Deterministic `{studentId}_{termId}`. Both `attendanceSummaryUtils.ts` (write) and `generateReportCard.ts` (read) use this pattern — `generateReportCard.ts` performs a single `getDoc` per student rather than a query.

**Who writes:** `institution_admin` only, via the rebuild utility page (`/admin/rebuild-attendance-summaries`). The rebuild performs O(students × sessions) writes using `setDoc` with the deterministic ID; run outside peak hours.

---

### `studentActivities` Collection

**Path:** `studentActivities/{activityId}`

Extra-curricular activities per student per term. Displayed on the student detail page and included in report card generation.

```text
studentActivities/{activityId}
  institutionId:  string
  studentId:      string
  classId:        string
  termId:         string
  academicYearId: string
  activityName:   string
  createdAt:      Timestamp
  createdBy:      string   // uid
  updatedAt:      Timestamp
```

---

### `studentResponsibilities` Collection

**Path:** `studentResponsibilities/{responsibilityId}`

Positions of responsibility per student per term. Displayed on the student detail page and included in report card generation.

```text
studentResponsibilities/{responsibilityId}
  institutionId:  string
  studentId:      string
  classId:        string
  termId:         string
  academicYearId: string
  title:          string
  organisation:   string | null
  createdAt:      Timestamp
  createdBy:      string   // uid
  updatedAt:      Timestamp
```

---

### `reportCardComments` Collection

**Path:** `reportCardComments/{commentId}`

Section-level comments for a student's report card. Four comment slots: class supervisor, grade supervisor, principal, vice-principal. Written via `ReportCardCommentsPage` (bulk class entry).

```text
reportCardComments/{commentId}
  institutionId:          string
  studentId:              string
  termId:                 string
  academicYearId:         string
  classSupervisorComment: string
  gradeSupervisorComment: string
  principalComment:       string
  vicePrincipalComment:   string
  updatedAt:              Timestamp
  updatedBy:              string   // uid
```

---

### `reportCards` Collection

**Path:** `reportCards/{cardId}`

Fully denormalized report card snapshot. Generated by `generateReportCard.ts` and written by `ReportCardsPage`. The document captures institution profile, student profile, all subject grades, conduct, attendance, and comments at generation time — it is a point-in-time snapshot and does not update automatically when source data changes.

```text
reportCards/{cardId}
  studentId:                string
  studentName:              string
  institutionStudentId:     string | null
  dateOfBirth:              string | null
  classId:                  string
  className:                string
  classPopulation:          number
  houseId:                  string | null
  houseName:                string | null
  termId:                   string
  termName:                 string
  academicYearId:           string
  academicYearName:         string
  nextTermStart:            string | null
  institutionId:            string
  institutionName:          string
  institutionMotto:         string | null
  institutionAddress:       string | null
  institutionPhone:         string | null
  institutionEmail:         string | null
  institutionLogoUrl:       string | null
  authorizedSignature:      { mode: 'image' | 'text'; imageUrl?: string; text?: string } | null
  classSupervisorLabel:     string
  gradeSupervisorLabel:     string
  principalLabel:           string
  vicePrincipalLabel:       string
  classSupervisorComment:   string
  gradeSupervisorComment:   string
  principalComment:         string
  vicePrincipalComment:     string
  totalPossibleSessions:    number
  sessionsAbsent:           number
  daysLate:                 number
  extraCurricularActivities: string[]
  positionsOfResponsibility: { title: string; organisation: string | null }[]
  gradingSystem:            'flat' | 'weighted'
  subjects:                 ReportCardSubjectRow[]
  studentAverage:           number | null
  classAverage:             number | null
  classRank:                number | null
  gpa:                      number | null
  demerits:                 number | null
  suspensions:              number | null
  detentions:               number | null
  generatedAt:              Timestamp
  generatedBy:              string   // uid
  generatedByRole:          string
  generatedViaBatch:        boolean
```

**Who writes:** `institution_admin` only. Batch generation uses `WriteBatch` (all students in a class in one batch commit). Individual regeneration overwrites the existing document.

---

### `gradebooks` Collection

**Path:** `gradebooks/{classId}_{subjectId}_{termId}`

Editable grade grid scoped to one class + subject + term. A gradebook document is created on the first save from the Gradebook page for a given class/subject/term combination. Assessment columns are stored as a subcollection (`gradebooks/{id}/columns`); individual student scores and feedback are written to the `results` and `feedback_comments` collections using their standard paths.

**Document ID strategy:** Deterministic composite key `{classId}_{subjectId}_{termId}`. Allows a `getDoc` without a prior query to check existence, and allows `generateReportCard.ts` to locate the correct gradebook for a subject+term without knowing an auto-generated ID.

```text
gradebooks/{classId}_{subjectId}_{termId}
  institutionId:  string
  classId:        string
  subjectId:      string
  termId:         string
  createdBy:      string    // uid of the creator
  createdAt:      Timestamp
```

**Who writes:** `institution_admin` (any class/subject); `senior_teacher` (their assigned class only); `regular_teacher` (subjects where their UID is in `subjects/{subjectId}.teacherIds`). `super_admin` can read but not write — Save button and column controls are not rendered for `super_admin`.

---

### `gradebooks/{gradebookId}/columns` Subcollection

**Path:** `gradebooks/{gradebookId}/columns/{columnId}`

Assessment column definitions within a gradebook. Each column represents one assessment event (e.g. "Week 3 Test"). The `columnId` is auto-generated by `addDoc` and is also written as `gradebookColumnId` on every `results` document the column produces, creating a stable join key between result rows and their column definition.

**Column delete restriction:** Only the `createdBy` user or an `institution_admin` may delete a column. Deletion is not permitted on completed terms.

```text
gradebooks/{gradebookId}/columns/{columnId}
  label:           string              // e.g. "Week 3 Test"
  assessmentType:  'coursework' | 'exam'
  maxScore:        number              // integer ≥ 1
  columnWeight:    number              // integer 0–100; all columns must sum to 100 for report card generation
  order:           number              // display sort order; assigned as existingColumnCount + 1 on creation; immutable after creation
  date?:           string              // optional ISO "YYYY-MM-DD"
  institutionId:   string
  subjectId:       string
  createdBy:       string              // uid
  createdAt:       Timestamp
```

**Weighted average formula (B-ii):** Both the Gradebook page and `generateReportCard.ts` compute:

```text
finalGrade = Σ(score / maxScore × columnWeight) / Σ(columnWeight) × 100
```

Report card generation hard-blocks if column weights do not sum to exactly 100%.

**Who writes:** Same roles as the parent `gradebooks` document.

---

## Subcollections

### `activity_log` — `users/{uid}/activity_log/{eventId}`

**Purpose:** Per-user record of sign-ins, sign-outs, and profile changes. Each user reads their own subcollection. Admins use a Collection Group query (`collectionGroup("activity_log")`) to read across users.

**Why `uid` and `institutionId` are stored as fields (denormalization):**  
Firestore Collection Group queries can only filter on document fields — not on path segments outside the matched collection name. Without these denormalized fields, `institution_admin` cannot filter a Collection Group query to only their users.

**Document schema:**

```text
users/{uid}/activity_log/{eventId}
  eventType:     'sign_in' | 'sign_out' | 'profile_update' | 'password_change'
               | 'photo_update' | 'notification_change'
  detail:        string   // "Chrome on Windows - Houston, TX"
  timestamp:     string   // ISO 8601
  uid:           string   // denormalized — same as parent document ID
  institutionId: string   // denormalized — from users/{uid}.institutionId
```

**Who writes:** Client-side, at:

- Sign-in: `AuthContext` after `onAuthStateChanged` fires (deduplication-guarded — see [Sign-In Deduplication Guard](#sign-in-deduplication-guard))
- Profile updates: after a successful write to `users/{uid}` from the profile page
- Photo updates: after a successful photo upload

---

### `audit_log` — `institutions/{institutionId}/audit_log/{eventId}`

**Purpose:** Institution-scoped record of admin actions. `institution_admin` reads their own institution's subcollection. `super_admin` uses a Collection Group query to read across institutions. The `_platform` sentinel covers super_admin platform-level events.

**Document schema:**

```text
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

**Who writes:** Client-side, when an admin performs a privileged action on another user. Each admin action should batch-write the primary document change and the audit entry atomically using a Firestore `WriteBatch`.

> **Trade-off — client vs. server writes:**  
> Client-side writes are simpler but carry a security risk: if rules are misconfigured, a malicious user could write fabricated audit entries. The correct long-term solution is Cloud Functions (Admin SDK), which cannot be forged. For MVP, client-side writes are acceptable provided the security rules tightly restrict who can write and what fields are accepted. Tracked as Issue #45 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md).

---

## Sign-In Deduplication Guard

**Problem:** `onAuthStateChanged` in `AuthContext` fires on every page load and hard refresh, not only on first sign-in. Without a guard, a `sign_in` entry is written to `activity_log` on every refresh — producing duplicates within the same session.

**Solution:** A `sessionStorage` flag. `sessionStorage` persists for the lifetime of the browser tab and is cleared when the tab is closed or the user signs out. It does not persist across tabs (unlike `localStorage`), so opening a new tab correctly generates a new sign-in entry.

**Implementation in `AuthContext`:**

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

**Clear the flag on sign-out** — in the `signOut` function in `AuthContext`:

```ts
async function signOut() {
  sessionStorage.removeItem(SESSION_SIGNIN_KEY);
  await firebaseSignOut(auth);
}
```

**Why `sessionStorage` over `lastSignInTime` comparison:**  
Comparing `user.metadata.lastSignInTime` against the most recent `activity_log` entry would require an additional Firestore read on every page load. `sessionStorage` is synchronous, zero-cost, and accurate for the tab session.

> **Note on `detail`:** Browser/device info (e.g., "Chrome on Windows") requires a User-Agent parser and optionally a geolocation API. For MVP, `detail` is left as an empty string. A raw UA string (`navigator.userAgent.slice(0, 80)`) can be substituted without any additional dependency.

---

## Firestore Indexes

Composite indexes must be created manually in the Firebase Console (or via the direct link that appears in the Firestore error when a query fails). Navigate to **Firestore Database → Indexes → Add index → Create structured index**.

> Single-field descending indexes (like `timestamp DESC` alone) are usually created automatically by Firestore. Any index with two or more fields, or any `array-contains` field, requires manual creation.

### Collection Group Indexes

| Collection ID | Fields | Used by |
| --- | --- | --- |
| `activity_log` | `uid` ASC · `timestamp` DESC | Future: per-user admin lookup |
| `activity_log` | `institutionId` ASC · `timestamp` DESC | `institution_admin` cross-user activity read |
| `audit_log` | `institutionId` ASC · `timestamp` DESC | `super_admin` filtered cross-institution audit query |
| `audit_log` | `eventType` ASC · `timestamp` DESC | Future: filter audit log by event type |

### Collection (Single) Indexes

| Collection | Fields | Used by |
| --- | --- | --- |
| `audit_log` | `timestamp` DESC | `institution_admin` single-institution audit read |
| `generalAttendance` | `institutionId` ASC · `classId` ASC · `date` ASC · `session` ASC | `GeneralAttendanceRegisterPage` week query; admin overdue detection |
| `subjectAttendance` | `institutionId` ASC · `subjectId` ASC · `classId` ASC · `sessionDate` ASC | `SubjectAttendancePage` week query; per-student subject attendance accordion (P2-6) |
| `timetable_slots` | `institutionId` ASC · `teacherId` ASC · `termId` ASC | `BigCalendar` teacher query |
| `timetable_slots` | `institutionId` ASC · `classId` ASC · `termId` ASC | `BigCalendar` student / parent query |
| `attendanceSummaries` | `institutionId` ASC · `classId` ASC · `termId` ASC | `generateReportCard` batch fetch; `ReportCardsPage` |
| `reportCards` | `institutionId` ASC · `classId` ASC · `termId` ASC | `ReportCardsPage` class/term filter |
| `subjects` | `institutionId` ASC · `teacherIds` ARRAY_CONTAINS | `ResultForm`, `FeedbackCommentForm`, `SubjectAttendancePage` teacher subject filter |
| `results` | `institutionId` ASC · `classId` ASC · `subjectId` ASC · `termId` ASC | `GradebookPage` — 4-field equality load query |
| `results` | `studentId` ASC · `termId` ASC · `institutionId` ASC | `generateReportCard` — per-student results fetch |
| `results` | `institutionId` ASC · `termId` ASC | `GradeEntryTrackingPage` — term-scoped fetch |
| `feedback_comments` | `institutionId` ASC · `classId` ASC · `subjectId` ASC · `termId` ASC | `GradebookPage` — 4-field equality load query |
| `feedback_comments` | `studentId` ASC · `termId` ASC · `institutionId` ASC | `generateReportCard` — per-student feedback fetch |
| `feedback_comments` | `institutionId` ASC · `termId` ASC | `GradeEntryTrackingPage` — term-scoped fetch |
| `timetable_slots` | `institutionId` ASC · `termId` ASC | `GradeEntryTrackingPage` — term-scoped fetch (not covered by the existing `institutionId + teacherId + termId` or `institutionId + classId + termId` indexes) |
| `generalAttendance` | `institutionId` ASC · `classId` ASC · `termId` ASC | `attendanceSummaryUtils.rebuildSummariesForClass` — 3-field rebuild query (distinct from the existing 4-field `institutionId + classId + date + session` index) |
| `generalAttendance` | `institutionId` ASC · `date` ASC | Admin home overdue badge (equality + equality) and `AttendanceChart` (equality + range on `date`) |
| `subjectAttendance` | `institutionId` ASC · `sessionDate` ASC | Admin home overdue badge — not covered by the existing `institutionId + subjectId + classId + sessionDate` index since `subjectId` sits between |
| `terms` | `institutionId` ASC · `academicYearId` ASC | `useInstitutionAcademicCalendar` — terms-by-academic-year filter |
| `users` | `role` ASC · `institutionId` ASC | Student list queries in `ResultForm`, `FeedbackCommentForm`, `ReportCardsPage`, and other pages |
| `reportCards` | `institutionId` ASC · `studentId` ASC | `ReportCardsPage` student role query and parent role `in` query (not covered by the existing `institutionId + classId + termId` index) |

> **`student_parents` — no composite index needed:** The `BigCalendar` parent fan-out queries by `parentId` only (single equality filter on a single field), which Firestore handles without a composite index. A single-field index on `parentId` is auto-created.

---

## Free-Tier Considerations

The Firebase Spark (free) plan limits that are most relevant to this app:

| Resource | Spark Limit | Risk area in this app |
| --- | --- | --- |
| Firestore reads | 50,000 / day | `onSnapshot` listeners on all 15 list pages; attendance/report card generation; `super_admin` institutions list |
| Firestore writes | 20,000 / day | Attendance saves; report card batch generation; attendance summary rebuild |
| Firestore deletes | 20,000 / day | Low risk — no bulk delete paths |
| Firebase Storage | 1 GB stored · 50K reads · 20K writes / day | Institution logo uploads |
| Firebase Auth | 10,000 sign-ins / day | Low risk at current scale |

### Read Pressure Points

**`onSnapshot` listeners on list pages:** Every list page (15 total) opens a persistent `onSnapshot` listener while mounted. For a user navigating several pages per session, each page mount adds one listener and associated read. Mitigation: listeners are unsubscribed on unmount (cleanup returned from `useEffect`). At scale, switch to `getDocs` with manual refresh for infrequently-changing lists.

**`super_admin` institutions list:** Previously unbounded — `InstitutionsTable` fetched all `institutions` documents on mount. Now paginated at **25 per page** using Firestore cursors. Safe below ~500 institutions with normal usage. At 200+ institutions per super_admin page load, consider adding server-side search.

**Report card generation:** `generateReportCard.ts` performs multiple `getDocs` calls per student (results, feedback, attendance summaries, student profile, institution profile). For a class of 40 students, a batch generation triggers ~40 × 5 = ~200 reads, plus one write per student. Plan batch runs during off-peak hours or across multiple days for large cohorts.

**Audit log Collection Group queries:** `collectionGroup("audit_log")` with no institution filter scans every `audit_log` document across all institutions. `limit(50)` bounds per-page cost. Add cursor pagination before audit log volume grows — see Issue #43 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md).

**`get()` calls in Security Rules:** Each Firestore Security Rules helper that calls `get(...)` (e.g., `me()`, `myRole()`, `myInstitutionId()`, `isClassTeacherFor()`) counts as one additional read against the daily quota **per rule evaluation** — not per client request. For a single write that triggers 3 `get()` rule calls, 4 reads are consumed (1 for the document + 3 for rules). At scale, replace `get()` calls in rules with Firebase Auth Custom Claims (`request.auth.token.role`, `request.auth.token.institutionId`). Tracked as Issue #46 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md).

### Write Pressure Points

**`attendanceSummaries` rebuild:** `RebuildAttendanceSummariesPage` computes and writes one `attendanceSummaries` document per student in the institution. For an institution with 200 students across 3 terms, a full rebuild writes 600 documents. At 20,000 writes/day on the free tier, a single rebuild for a mid-size institution consumes 3% of the daily write budget. Advise running outside peak hours and only when needed (not on every attendance save).

**Report card batch generation:** `ReportCardsPage` batch-generates one `reportCards` document per student via `WriteBatch`. For a class of 40 students, this is 40 write operations per batch commit. The Spark tier's 20,000 writes/day limit supports ~500 batch-generated report cards per day. For larger institutions, generate by class, not by institution, to spread writes across days.

### Storage

**Logo uploads:** Institution logos are resized client-side to ≤300 px before upload and stored at `institutions/{institutionId}/logo`. At ~50 KB per logo, 1 GB Spark storage supports ~20,000 logos. Storage reads are low-frequency (loaded once per session per user). Free tier supports 50,000 reads/day.

### Staying Within Limits

- Never call `getDocs` on an unfiltered top-level collection from the client (always `where('institutionId', '==', ...)`).
- Prefer `onSnapshot` for real-time data (one read per update) over polling with `getDocs` in a loop.
- Use `WriteBatch` for multi-document writes — it is atomic and counts as individual writes, not a single write; but it reduces round trips and rule evaluation overhead.
- Add `limit()` to every query that could return unbounded results.
- Monitor daily quota usage in the Firebase Console (Firestore → Usage tab) after any bulk operation.

---

## Performance Notes

- **Collection Group query cost:** A `collectionGroup("audit_log")` query with no filter scans every `audit_log` document across all institutions. `limit(50)` bounds per-page read cost. Cursor-based pagination should be added before audit log volume grows — see Issue #43 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md).
- **institutions list fetch on `/admin/audit-log`:** Fetches all `institutions` documents on mount to populate the filter dropdown. Safe below ~200 institutions. At scale, add a `limit` and server-side search.
- **`WriteBatch` for audit writes:** Atomically committing the primary change and the audit entry is both safer (no partial state) and slightly more efficient (one round trip vs. two).
- **`addDoc` on sign-in:** Mitigated by the `sessionStorage` deduplication guard — see [Sign-In Deduplication Guard](#sign-in-deduplication-guard). Without the guard, `onAuthStateChanged` firing on every page refresh would produce duplicate `sign_in` entries.

### `get()` Calls in Security Rules

Each helper function that calls `get(...)` (e.g., `me()`, `myRole()`, `myInstitutionId()`) counts as one Firestore read against the daily quota per rule evaluation. For low-traffic apps this is acceptable. At scale, the standard mitigation is to store `role` and `institutionId` as Firebase Auth custom claims via `setCustomUserClaims` in a Cloud Function, then replace all `get(...)` calls in rules with `request.auth.token.role` and `request.auth.token.institutionId`. This eliminates the extra reads entirely. Tracked as Issue #46 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md).

---

## Trade-offs

| Decision | Trade-off |
| --- | --- |
| `activity_log` as subcollection under `users/{uid}` | Per-user reads are efficient; cross-user reads require Collection Group queries and composite indexes. |
| `audit_log` as subcollection under `institutions/{institutionId}` | Institution data is physically isolated; `super_admin` cross-institution reads require Collection Group queries. |
| Client-side audit writes | Simpler than Cloud Functions. Risk: rule misconfiguration could allow forged entries. Mitigation: strict field validation in rules + `allow update/delete: if false`. |
| `_platform` sentinel document | Provides a home for super_admin platform-level events without a special code path. Risk: `_platform` must be created manually before any super_admin writes; missing sentinel causes a write to a non-existent parent path. |
| `fmtDateTime` for activity timestamps | Reuses the existing helper already in the component. All timestamps stored as ISO 8601 in Firestore; display formatting is presentation-layer only. |
| `limit(50)` on audit log page | Bounds read cost per page load. Means recent events may not appear if more than 50 exist and pagination is not implemented. |
| `teacherIds` array on `subjects` (not junction collection) | Enables `array-contains` queries and single-`get()` rule checks. Downside: must update array atomically on teacher assignment changes; stale names if teacher display name changes. |
| Excluded-student model in `subjectEnrollments` | Write-efficient (most students take all class subjects). Downside: must maintain exclusion list; adding a new student requires no action (included by default). |
| `attendanceSummaries` as a rebuild-only collection | Avoids incremental write on every attendance save (which would double write cost). Downside: summaries are stale until the rebuild utility is run. Report cards generated before a rebuild use outdated attendance data. |
| `reportCards` as denormalized snapshots | Report cards are stable point-in-time records that don't change when source data changes (correct behavior for issued report cards). Downside: regeneration is required to reflect corrections. |

### Wildcard Collection Group caveat

The `match /{path=**}/activity_log/{eventId}` pattern used in Firestore security rules matches **any** collection named `activity_log` anywhere in the database, not just under `users/{uid}`. This is intentional — it is the only way to enable Collection Group queries in Firestore rules.

The risk is mitigated by two factors:

1. The `institution_admin` rule applies a `resource.data.institutionId == myInstitutionId()` field check, scoping reads to the admin's own institution.
2. The write rules only permit writes to the known subcollection path (`users/{uid}/activity_log`), so no unexpected `activity_log` collection can accumulate data.

---

## Form System — Design Constraints

Non-obvious design decisions and constraints in the form and CRUD system.

### Junction Collections — SubjectForm and ClassForm

**Teacher-to-subject assignments** are stored as `teacherIds` (UID array) and `teacherNames` (denormalized display name array) directly on the subject document — **not** in the `teacher_subjects` junction collection. `SubjectForm` writes both arrays at create and update time. The `teacher_subjects` collection is superseded by this design and its Firestore rules are removed as part of the atomic SubjectForm deployment (see [`SUBJECT_FORM_SPEC.md`](./SUBJECT_FORM_SPEC.md) §11).

The array-on-document approach is architecturally required:

- Firestore rules permit only one `get()` per evaluation — `get(subjects/$(subjectId)).data.teacherIds` relies on the array being on the document; a junction collection cannot be queried from rules.
- `where('teacherIds', 'array-contains', uid)` — used to filter a teacher's subjects in ResultForm, FeedbackCommentForm, and the student list — also requires the array on the document.

No data was ever written to `teacher_subjects` (no write path existed), so removal has no impact on live data. Issue #26 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md) has been updated accordingly.

**Authoritative teacher-class links** are stored in the `teacher_classes` junction collection. The `supervisor` field on a class document is a **denormalized display name** only — a convenience copy for display. `ClassForm` writes this field as free-text for now; in live mode it should become a dropdown populated from the institution's teacher list. Tracked as Issue #48 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md).

### Teacher Scope — LessonForm and ExamForm

`regular_teacher` can only create or edit lessons and exams for their own classes. `senior_teacher` can create or edit lessons and exams for any class in their department. **This scope difference is enforced at the Firestore rules layer** (`isClassTeacherFor` / `isSeniorTeacherFor` helpers) — not in the UI. Both teacher roles see an identical form. A write outside a teacher's permitted scope is denied by Firestore at runtime.

### ResultForm — Create and Update, with Locked Context Fields

`ResultForm` supports both create and update modes.

**Create mode** exposes the full set of inputs: `studentId`, `classId`, `termId`, `assessmentName`, `score`, `maxScore`, `weight` (only when the institution's grading system is `"weighted"`), and `date`.

**Update mode** intentionally restricts writes to assessment fields only — `assessmentName`, `score`, `maxScore`, `weight`, and `date`. The `studentId`, `classId`, and `termId` fields are not sent in the `updateDoc` call, making them immutable after a result is created. This is by design: a teacher correcting a score or assessment name should not be able to re-attribute the result to a different student, class, or term.

### ParentForm — Firebase Auth Fields Must Not Be Edited

`ParentForm` exposes only `phone` and `address`. **`name` and `email` must not appear as editable inputs** — they are Firebase Authentication credentials. Changing them requires Auth API calls (`updateEmail`, `updateProfile`), not a Firestore write. Exposing them in a Firestore form would silently fail to update Auth state.

### Onboard Institution — Two-Step Flow

The "Onboard Institution" quick-action on the super_admin dashboard routes to `/onboard-institution`, a `super_admin`-only two-step wizard. Step 1 creates the `institutions` document (name only; all other fields are auto-set). Step 2 creates the `institution_admin` account with the new `institutionId` pre-filled and locked.

Step 2 is required — there is no skip. However, browser-level navigation (back button, tab close) after step 1 commits can leave an orphan `institutions` document with no admin. Recovery: use `/create-user` to create an `institution_admin` and manually enter the orphaned institution's ID.

Full implementation plan: [`ONBOARD_INSTITUTION_PLAN.md`](ONBOARD_INSTITUTION_PLAN.md).

---

### AnnouncementForm — `description` Field Not Yet in TS Type

`AnnouncementForm` includes a `description` textarea (optional, max 2000 chars). This field is **not yet present** in the local `Announcement` TypeScript type in `src/scenes/(dashboard)/list/announcements/index.tsx`, nor in any Firestore type definitions. It must be added to both when the data layer is connected. Tracked as Issue #51 in [`ISSUES_AND_GAPS.md`](ISSUES_AND_GAPS.md).
