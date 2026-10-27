# Firebase Rules

> **Convention change (see `docs/overhaul/FIRESTORE_INSTITUTION_NESTING_SPEC.md` §7.2):** the authoritative copy of the security rules is now the tracked **`firestore.rules`** file at the repo root, deployed via `npm run firebase:deploy:rules` (or `npm run firebase:deploy` for rules + indexes together) — not the Firebase Console. **Confirmed in effect** — the first confirming deploy (§11 step 1 of that spec) succeeded via `npm run firebase:deploy`: rules compiled and released cleanly (already matching the Console, so nothing to upload), and indexes deployed successfully from `firestore.indexes.json`. This file no longer carries a full copy of the rules text — duplicating 700+ lines across two files is exactly the stale-mirror pattern this repo's own overhaul spec flagged as a bug elsewhere (§13.1) — it now exists only for context that plain rules code can't hold: the rationale behind specific decisions and the composite-index notes below, which supplement (not replace) the full, current index list in `firestore.indexes.json`.
>
> For the actual rules, read `firestore.rules`. For the actual indexes, read `firestore.indexes.json`.

## Composite index notes

Rationale for indexes that aren't self-explanatory from their field list alone. This is not a complete index inventory — see `firestore.indexes.json` for that; entries below are being kept for their "why," not as a duplicate "what."

- **`generalAttendance`** — Collection scope, fields `institutionId ASC · classId ASC · date ASC · session ASC`. Required for the live register query and admin overdue detection. **Nested-path addition (§11 step 8 of `FIRESTORE_INSTITUTION_NESTING_SPEC.md`):** a second Collection-scope index, `classId ASC · date ASC` (no `institutionId`, no `session` — dropped since no converted query filters on it), was added for the `institutions/{institutionId}/generalAttendance` queries — Collection-scope indexes apply per collection ID regardless of nesting depth (§6.1 of that spec), so this one index covers every institution's live register, week view, gridsheet, and child/parent read once they hit the nested path. Both indexes stay in place side by side until the flat collection's deletion pass runs at cutover.
- **`subjectAttendance`** — Collection scope, fields `institutionId ASC · subjectId ASC · classId ASC · sessionDate ASC`. Required for the subject register week query and the P2-7 admin overdue badge extension. **Nested-path addition (same §11 step 8 / §6.1 reasoning as above):** a second Collection-scope index, `subjectId ASC · classId ASC · sessionDate ASC` (no `institutionId`), was added for the nested-path equivalent — covers the subject register week query and the child/my-attendance per-enrollment lookups once they hit the nested path.

## Institution email settings (`institutions/{id}/email_settings/{doc}`)

Holds an institution's own EmailJS ids for first-login emails (`INSTITUTION_LOGIN_EMAILS_SPEC.md`, MVP status). Readable by that institution's `institution_admin` and by `super_admin`; **no client writes** (`allow write: if false`), so the document is created in the Firebase console. `users/{uid}.credentialsEmailedAt` and `credentialsEmailCount` are written by an institution admin through the existing admin `update` clause; the owner allow-list does not list them, so a user cannot reset their own cooldown.

## Lesson note files (`lessonNotes/{id}` and `lessonNotes/{id}/attachment/{fileId}`)

A note can hold up to five files (`LESSON_NOTES_FEATURE_SPEC.md` section 11). The note carries `attachments` (each file's metadata) and `attachmentIds` (the file document ids); both or neither, at most 5, equal length; a note needs neither a file nor a link. Each file is its own `attachment/{fileId}` document, writable only when `fileId` is in the note's `attachmentIds` after the write (`getAfter()`); a note with no list allows only `data` (the one file an older note had). The rules accept both shapes, so deploy them before the app and the migration script.

## Online exams (`exams/{id}` and its subcollections)

Designed in `EXAMS_FEATURE_SPEC.md` (sections 5 and 7). A plain (schedule-only) exam keeps its old rules and is not validated. When the document has `online: true` the rules validate its whole shape (Multiple Choice only, title, window, duration 5 to 300, question count up to 100, checkpoint 5 to 15), start a new exam as a draft and enforce the status graph (draft, published, closed, finalized). The exam document may also carry `integrity` (`supervised` or `unsupervised`; absent means supervised) and `forwardOnly` (a boolean that can be true only when `integrity` is `unsupervised`), the two supervision settings of `EXAM_IMAGES_AND_INTEGRITY_SPEC.md` §9.2; an exam that never sets them is valid and saved exactly as before. The subcollections:

- **`content/questions`** (no answers): staff of the exam, administrators and the spectator at any time; a student of the exam's class only while it is published, from `opensAt` to two hours after `closesAt`, **and only while their own attempt exists and is in progress** (one more rule read), so the paper is not readable before the clock starts or after the hand-in. Never a parent. Written only while the exam is a draft or before it opens.
- **`content/images_{n}`** (the pictures of the questions, up to 100 to a pack, written by the exam's staff in the same circumstances as the questions): a pack has exactly a `revision` (a whole number, 1 or more), `updatedAt` (the server time) and `images` (1 to 100 pictures). The wildcard `content/{pack}` is guarded by `isImagePackId` (`images_` and a number), so it can never write `content/questions`. Staff, administrators and the spectator may read any document of `content`, which lets them list it; a student reads a **pack by its id** only with their own attempt in progress and the exam open to them (the same test as the questions, one more rule read), and cannot list; a parent never reads one. The exam document carries `imagePacks` (0 to 100) and `imageBytes` (up to 120,000,000), written by the save only when the exam has pictures. `firestore.indexes.json` has a field override for `content.images` with no indexes, so a picture's data is not indexed (deploy with `npm run firebase:deploy:indexes`; optional). The size of one picture is bounded by the client and the 1 MiB document limit only (ISSUES_AND_GAPS #74). Tested in `rules-tests/examImages.rules.test.ts`.
- **`private/key`**: staff of the exam, administrators and the spectator only; never a student or parent.
- **`attempts/{studentUid}`**: one per student, started on the server clock inside the window with a deadline bounded by the duration, the student's extra time and the close, and a `seed` (8 to 64 characters) the order of questions is worked out from; saved or submitted only up to 60 seconds after the deadline; marked expired by staff only after that grace; read by the student and the exam's staff.
- **`grades/{studentUid}`**: a student or linked parent reads it only after `releaseAt`, and by id (not by query); written by the exam's staff. It may also carry the attempt's `tabSwitches`, `submittedAt` and `submitReason` (copied when graded, so they survive Finalize), a `manualReason` of at most 200 characters and a `comment` of at most 500.
- **`accommodations/{studentUid}`**: 1 to 120 extra minutes, set by the exam's staff, readable by the student.

"Staff of the exam" is an administrator, the exam's own teacher (`teacherId`) or a senior teacher of its department. The rules are tested on the emulator with `npm run test:rules` (`rules-tests/`, needs Java) and pinned as text by `src/lib/__tests__/examRules.test.ts`. Delete the subcollection documents before the exam document: that is the order the delete button follows (`src/lib/examDelete.ts`; the emulator file `rules-tests/examDeleteClient.rules.test.ts` sends its deletes to the rules), and only an administrator can delete an exam, so an administrator can also clear the leftovers of an exam whose document is already gone. The first version of the exam rules, with the grade fields of step 6, was deployed on 2026-10-21. The rules of the pre-PR review (the attempt-first read of the questions, the `seed`, the question write lock and the expiry grace) are in the repository: run `npm run firebase:deploy:rules` before the app that uses them, and deploy the `lessonNotes (classIds, updatedAt)` index and wait for READY before the app as well.

## Realtime Database rules (`database.rules.json`)

The tracked file `database.rules.json` is authoritative; deploy with `firebase deploy --only database --project <id>`. It is pinned by `src/lib/__tests__/databaseRules.test.ts` and explained in `docs/miscellaneous-specs/LARGE_ATTACHMENTS_RTDB_SPEC.md`. Default is deny; three branches are open:

- **`/sessions/{uid}`** — the single-session lock; only the signed-in owner reads or writes it.
- **`/files/{institutionId}/{blobKey}`** — large lesson-note and assignment files (500 KB to 5 MB). Read by exact path only (no listing); create or delete only, never overwrite; the key must be a lower-case UUID; fixed fields (`dataUrl`, `size`, `mimeType`, `uploadedAt`, `uploadedBy`) with an allowed type, a size cap and the uploader's own uid. Every create or delete must move `usage/institutions/{institutionId}/bytes` and `usage/total/bytes` by exactly the file's size in the same write.
- **`/usage/institutions/{institutionId}/bytes`** (cap 200,000,000) and **`/usage/total/bytes`** (cap 900,000,000) — the byte counters.

**Known limits:** these rules cannot read Firestore and the app has no custom claims, so they **cannot check a caller's role, class or institution**. Any signed-in account that learns a file's key can read it, and any signed-in account can create files within the budgets. "Only teachers and institution admins may upload large files" is enforced in the UI only. The counters are accounting, not authentication.

**Firestore side** (`firestore.rules`): `isValidBlobKey()` and `isValidAttachmentSize()` helpers; a lesson note's `attachment/data` holds exactly one of `dataUrl` or `blobKey`; an assignment's `attachmentBlobKey` may not accompany `attachmentDataUrl`; student submissions never use a key.

## History

The block below is preserved as a point-in-time historical snapshot of the rules as documented prior to the CLI/convention change above — it may already be stale relative to `firestore.rules` and should not be treated as current. Kept only because several other specs in this repo (`DISCIPLINARY_ACTION_SPEC.md`, `SUBJECT_FORM_SPEC.md`, and others) reference this file by name; do not update this snapshot going forward — update `firestore.rules` instead.

### Rules snapshot (pre-CLI, historical)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helpers ────────────────────────────────────────────────────────────
    function isSignedIn() {
      return request.auth != null;
    }

    function me() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
    }

    function myRole() {
      return me().role;
    }

    function myInstitutionId() {
      return me().institutionId;
    }

    function isSuperAdmin() {
      return isSignedIn() && myRole() == 'super_admin';
    }

    function isAdmin() {
      return isSignedIn() && myRole() == 'institution_admin';
    }

    function isAdminOrAbove() {
      return isSuperAdmin() || isAdmin();
    }

    function isTeacher() {
      return isSignedIn() && (myRole() == 'senior_teacher' || myRole() == 'regular_teacher');
    }

    function isSeniorTeacher() {
      return isSignedIn() && myRole() == 'senior_teacher';
    }

    function isTeacherOrAbove() {
      return isAdminOrAbove() || isTeacher();
    }

    function isParent() {
      return isSignedIn() && myRole() == 'parent';
    }

    function isOwner(uid) {
      return isSignedIn() && request.auth.uid == uid;
    }

    function roleNotChanged() {
      return !('role' in request.resource.data.diff(resource.data).affectedKeys());
    }

    function institutionNotChanged() {
      return !('institutionId' in request.resource.data.diff(resource.data).affectedKeys());
    }

    // Super admin bypasses institution scoping ('*' sentinel)
    function sameInstitution(docInstitutionId) {
      return isSuperAdmin() || myInstitutionId() == docInstitutionId;
    }

    // For creates: check the institution on the incoming document
    function writingToMyInstitution() {
      return isSuperAdmin() || request.resource.data.institutionId == myInstitutionId();
    }

    // Returns true if the calling teacher is the designated class teacher
    // for the given classId. Pass resource.data.classId on update and
    // request.resource.data.classId on create.
    function isClassTeacherFor(docClassId) {
      return isTeacher()
        && get(/databases/$(database)/documents/classes/$(docClassId)).data.classTeacherId
           == request.auth.uid;
    }

    // Returns true if the calling user is a senior teacher whose department
    // matches the given departmentId. Pass resource.data.departmentId on update
    // and request.resource.data.departmentId on create.
    // Requires the target document to store a departmentId field.
    // NOTE: this copy is an older snapshot. The live helper in firestore.rules
    // reads users/{uid}.departmentId first and only falls back to the legacy
    // teachers/{uid} mirror, which the app no longer writes. A teacher with no
    // departmentId on their users doc matches nothing — see ISSUES_AND_GAPS.md
    // #38 for how that is now prevented and surfaced.
    function isSeniorTeacherFor(docDepartmentId) {
      let teacher = get(/databases/$(database)/documents/teachers/$(request.auth.uid)).data;
      return myRole() == 'senior_teacher'
        && teacher.departmentId == docDepartmentId;
    }

    // ── Users ──────────────────────────────────────────────────────────────
    match /users/{uid} {
      // Own profile always readable; admins read within their institution;
      // teachers can read student profiles within their institution (required for subject/general attendance).
      // ⚠️  DEPLOY REQUIRED: the teacher clause below was added to fix subject attendance and general attendance
      // empty-student bugs. Copy these rules into the Firebase Console → Firestore → Rules tab and publish.
      allow read: if isOwner(uid)
        || (isAdminOrAbove() && sameInstitution(resource.data.institutionId))
        || (isTeacher() && sameInstitution(resource.data.institutionId) && resource.data.role == 'student');

      // super_admin can create any role; institution_admin is restricted to
      // non-privileged roles and cannot elevate to institution_admin or super_admin
      allow create: if isSuperAdmin()
        || (isAdmin() && writingToMyInstitution() && request.resource.data.role in ['senior_teacher', 'regular_teacher', 'student', 'parent']);

      // An owner may change only the fields ownerMayEditOwnProfile() lists — an
      // ALLOW-LIST: toursCompleted and mustChangePassword (only to false) for any
      // role, plus name/phone/emergencyContact for a super_admin. classId,
      // assignedClassId, canGenerateSchedule, departmentId, status, houseId,
      // email and the other identity fields are trusted by other rules or by
      // reports, so only an admin sets them. role and institutionId stay frozen
      // for everyone.
      // Admins can edit any profile within their institution — this broad clause
      // also covers institution_admin writing canGenerateSchedule on a
      // senior_teacher's document — EXCEPT another institution_admin's: only a
      // super_admin edits admins.
      allow update: if (isOwner(uid) && roleNotChanged() && institutionNotChanged()
            && ownerMayEditOwnProfile())
        || (isAdminOrAbove() && sameInstitution(resource.data.institutionId)
            && institutionNotChanged() && roleNotChanged()
            && (isSuperAdmin() || resource.data.role != 'institution_admin'));

      // Super admin can delete any user document. An institution_admin can delete a
      // student's or a teacher's (never an admin's, a parent's or any other role's, and
      // never their own) in their own institution: the "Delete user" button removes
      // the person's data first and this document last. The Firebase Auth account is
      // removed afterwards by scripts/remove-orphan-auth-accounts.mjs.
      allow delete: if isSuperAdmin()
        || (isAdmin() && !isOwner(uid)
            && sameInstitution(resource.data.institutionId)
            && resource.data.role in ['student', 'regular_teacher', 'senior_teacher']);
    }

    // ── Activity log (per-user subcollection) ──────────────────────────────
    // Users read their own log. Admins read via Collection Group (see below).
    // Users write only sign_in / profile_update entries; an admin may write only
    // photo_update into another account's log. Exact key set (+ recordedAt),
    // institutionId must be the account's real one, detail <= 200 chars.
    // `timestamp` is the legacy CLIENT-supplied ISO string (shape-checked only);
    // `recordedAt` must equal request.time and is the trustworthy time.
    // Admins cannot read individual subcollections via this rule — use Collection Group.
    match /users/{uid}/activity_log/{eventId} {
      allow read:   if isOwner(uid);
      allow create: if request.resource.data.keys().hasOnly(
            ['eventType','detail','timestamp','uid','institutionId','recordedAt'])
        && request.resource.data.keys().hasAll(
            ['eventType','detail','timestamp','uid','institutionId','recordedAt'])
        && request.resource.data.uid == uid
        && request.resource.data.recordedAt == request.time
        && request.resource.data.detail is string
        && request.resource.data.detail.size() <= 200
        && request.resource.data.timestamp is string
        && request.resource.data.timestamp.matches('^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$')
        && (
          (isOwner(uid)
            && request.resource.data.eventType in ['sign_in', 'profile_update']
            && (request.resource.data.institutionId == myInstitutionId()
                || (isSuperAdmin() && request.resource.data.institutionId in ['', '*'])))
          || (isAdminOrAbove()
            && request.resource.data.eventType == 'photo_update'
            && sameInstitution(get(/databases/$(database)/documents/users/$(uid)).data.institutionId)
            && request.resource.data.institutionId
                 == get(/databases/$(database)/documents/users/$(uid)).data.institutionId)
        );
      allow update, delete: if false;
    }

    // ── Subjects ───────────────────────────────────────────────────────────
    match /subjects/{subjectId} {
      allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      allow update: if isAdminOrAbove() && sameInstitution(resource.data.institutionId) && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Classes ────────────────────────────────────────────────────────────
    match /classes/{classId} {
      allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      allow update: if isAdminOrAbove() && sameInstitution(resource.data.institutionId) && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Terms ──────────────────────────────────────────────────────────────
    // Grading periods within a school year. Admin-managed, read by everyone
    // in the institution. Status transitions (open/closed) are enforced in
    // the application layer, not in rules.
    match /terms/{termId} {
      allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      allow update: if isAdminOrAbove()
        && sameInstitution(resource.data.institutionId)
        && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Academic Years ─────────────────────────────────────────────────────
    match /academicYears/{yearId} {
      allow read: if isSignedIn()
        && sameInstitution(resource.data.institutionId);

      allow create, update, delete: if isSignedIn()
        && isAdmin()
        && writingToMyInstitution();
    }

    // ── Non-School Days ────────────────────────────────────────────────────
    match /nonSchoolDays/{dayId} {
      allow read: if isSignedIn()
        && sameInstitution(resource.data.institutionId);

      allow create, update, delete: if isSignedIn()
        && isAdmin()
        && writingToMyInstitution();
    }

    // ── Houses ─────────────────────────────────────────────────────────────
    // Institution-defined houses (e.g. boarding houses, sports houses).
    // Only institution_admin can create, update, or delete.
    // All signed-in institution members can read.
    match /houses/{houseId} {
      allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
      allow create: if isAdmin() && writingToMyInstitution();
      allow update: if isAdmin()
        && sameInstitution(resource.data.institutionId)
        && institutionNotChanged();
      allow delete: if isAdmin() && sameInstitution(resource.data.institutionId);
    }

    // ── Departments ────────────────────────────────────────────────────────
    // Academic departments. Each has a headTeacherId pointing to a senior
    // teacher; this reference is validated in the application layer.
    match /departments/{departmentId} {
      allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      allow update: if isAdminOrAbove()
        && sameInstitution(resource.data.institutionId)
        && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Teachers ───────────────────────────────────────────────────────────
    match /teachers/{teacherId} {
      allow read: if isOwner(teacherId)
        || (isSignedIn() && sameInstitution(resource.data.institutionId));
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      // Admin-only. The owner used to be able to edit their own mirror, and
      // isSeniorTeacherFor() trusted its departmentId (a self-assignment path);
      // both are closed — the live helper reads users.departmentId only.
      allow update: if isAdminOrAbove()
        && sameInstitution(resource.data.institutionId)
        && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Students ───────────────────────────────────────────────────────────
    match /students/{studentId} {
      allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
        || isOwner(studentId)
        || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + studentId)));
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      allow update: if (isAdminOrAbove() || isOwner(studentId))
        && sameInstitution(resource.data.institutionId)
        && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Parents ────────────────────────────────────────────────────────────
    match /parents/{parentId} {
      allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
        || isOwner(parentId);
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      allow update: if (isAdminOrAbove() || isOwner(parentId))
        && sameInstitution(resource.data.institutionId)
        && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Teacher-Classes junction ───────────────────────────────────────────
    match /teacher_classes/{docId} {
      allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      allow update: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Student-Parents junction ───────────────────────────────────────────
    // Document ID format: {parentId}_{studentId}
    match /student_parents/{docId} {
      allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
        || resource.data.studentId == request.auth.uid
        || resource.data.parentId == request.auth.uid;
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      allow update: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Lessons ────────────────────────────────────────────────────────────
    // Senior teachers may edit any lesson in their department.
    match /lessons/{lessonId} {
      allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
      allow create: if isTeacherOrAbove() && writingToMyInstitution();
      allow update: if sameInstitution(resource.data.institutionId)
        && (isAdminOrAbove()
          || (isTeacher() && resource.data.teacherId == request.auth.uid)
          || isSeniorTeacherFor(resource.data.departmentId))
        && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Exams ──────────────────────────────────────────────────────────────
    // Senior teachers may edit any exam in their department.
    match /exams/{examId} {
      allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
      allow create: if isTeacherOrAbove() && writingToMyInstitution();
      allow update: if sameInstitution(resource.data.institutionId)
        && (isAdminOrAbove()
          || (isTeacher() && resource.data.teacherId == request.auth.uid)
          || isSeniorTeacherFor(resource.data.departmentId))
        && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Assignments ────────────────────────────────────────────────────────
    // Senior teachers may edit any assignment in their department.
    match /assignments/{assignmentId} {
      allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
      allow create: if isTeacherOrAbove() && writingToMyInstitution();
      allow update: if sameInstitution(resource.data.institutionId)
        && (isAdminOrAbove()
          || (isTeacher() && resource.data.teacherId == request.auth.uid)
          || isSeniorTeacherFor(resource.data.departmentId))
        && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Results ────────────────────────────────────────────────────────────
    // Stage 2: regular_teacher create/update now requires uid in subject's teacherIds.
    // senior_teacher access via isSeniorTeacherFor(departmentId) is unchanged.
    // The original teacherId == request.auth.uid and score guards are preserved.
    match /results/{resultId} {
      allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
        || resource.data.studentId == request.auth.uid
        || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)));

      allow create: if isTeacherOrAbove()
        && writingToMyInstitution()
        && request.resource.data.teacherId == request.auth.uid
        && request.resource.data.score <= request.resource.data.maxScore
        && (isAdminOrAbove()
          || isSeniorTeacherFor(request.resource.data.departmentId)
          || (myRole() == 'regular_teacher'
              && request.auth.uid in get(
                   /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
                 ).data.teacherIds));

      allow update: if sameInstitution(resource.data.institutionId)
        && request.resource.data.score <= request.resource.data.maxScore
        && (isAdminOrAbove()
          || isSeniorTeacherFor(resource.data.departmentId)
          || (myRole() == 'regular_teacher'
              && resource.data.teacherId == request.auth.uid
              && request.auth.uid in get(
                   /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
                 ).data.teacherIds))
        && institutionNotChanged();

      allow delete: if (isAdminOrAbove() && sameInstitution(resource.data.institutionId))
        || (isTeacher()
            && sameInstitution(resource.data.institutionId)
            && resource.data.source == 'gradebook');
    }

    // ── Feedback Comments ──────────────────────────────────────────────────
    // Stage 2: regular_teacher create/update now requires uid in subject's teacherIds.
    // senior_teacher access via isSeniorTeacherFor(departmentId) is unchanged.
    // Upsert key updated: studentId + teacherId + subjectId + termId (enforced at app layer).
    match /feedback_comments/{docId} {
      allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
        || resource.data.studentId == request.auth.uid
        || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)));

      allow create: if writingToMyInstitution()
        && (isAdminOrAbove()
          || (request.resource.data.teacherId == request.auth.uid
              && (isSeniorTeacherFor(request.resource.data.departmentId)
                  || (myRole() == 'regular_teacher'
                      && request.auth.uid in get(
                           /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
                         ).data.teacherIds))));

      allow update: if sameInstitution(resource.data.institutionId)
        && (isAdminOrAbove()
          || isSeniorTeacherFor(resource.data.departmentId)
          || (myRole() == 'regular_teacher'
              && resource.data.teacherId == request.auth.uid
              && request.auth.uid in get(
                   /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
                 ).data.teacherIds))
        && institutionNotChanged();

      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Student Activities ────────────────────────────────────────────────────
    // Extra-curricular activities entered per student per term by institution_admin.
    // Teachers and admins can read all within the institution; students and parents
    // can read records belonging to the student (or linked child).
    match /studentActivities/{id} {
      allow read: if isSignedIn()
        && sameInstitution(resource.data.institutionId)
        && (isTeacherOrAbove()
          || resource.data.studentId == request.auth.uid
          || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId))));
      allow create: if isAdmin() && writingToMyInstitution();
      allow update: if isAdmin()
        && sameInstitution(resource.data.institutionId)
        && institutionNotChanged();
      allow delete: if isAdmin() && sameInstitution(resource.data.institutionId);
    }

    // ── Student Responsibilities ───────────────────────────────────────────────
    // Positions of responsibility per student per term. Same access pattern as
    // studentActivities.
    match /studentResponsibilities/{id} {
      allow read: if isSignedIn()
        && sameInstitution(resource.data.institutionId)
        && (isTeacherOrAbove()
          || resource.data.studentId == request.auth.uid
          || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId))));
      allow create: if isAdmin() && writingToMyInstitution();
      allow update: if isAdmin()
        && sameInstitution(resource.data.institutionId)
        && institutionNotChanged();
      allow delete: if isAdmin() && sameInstitution(resource.data.institutionId);
    }

    // ── Report Card Comments ──────────────────────────────────────────────────
    // Section comments (classSupervisor, gradeSupervisor, principal, vicePrincipal)
    // written per student per term by institution_admin. Not exposed to teachers,
    // students, or parents — only institution_admin and super_admin can read.
    match /reportCardComments/{id} {
      allow read: if isSignedIn()
        && sameInstitution(resource.data.institutionId)
        && isAdminOrAbove();
      allow create: if isAdmin() && writingToMyInstitution();
      allow update: if isAdmin()
        && sameInstitution(resource.data.institutionId)
        && institutionNotChanged();
      allow delete: if isAdmin() && sameInstitution(resource.data.institutionId);
    }

    // ── Report Cards ──────────────────────────────────────────────────────────
    // Generated report card documents, one per student per term.
    // Admins and teachers can read all within their institution.
    // Students read their own; parents read their linked child's.
    // Only institution_admin can create, update, or delete.
    match /reportCards/{id} {
      allow read: if isSignedIn()
        && sameInstitution(resource.data.institutionId)
        && (isTeacherOrAbove()
          || resource.data.studentId == request.auth.uid
          || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId))));
      allow create: if isAdmin() && writingToMyInstitution();
      allow update: if isAdmin()
        && sameInstitution(resource.data.institutionId)
        && institutionNotChanged();
      allow delete: if isAdmin() && sameInstitution(resource.data.institutionId);
    }

    // ── Disciplinary Actions ──────────────────────────────────────────────────
    // Merit/Demerit/Detention/Suspension log. Any teacher-or-above may create an
    // entry for any student in their institution. Only admins may edit/delete —
    // intentionally not even the original issuer, to keep this closer to an
    // audit trail. Read access matches reportCards/feedback_comments exactly:
    // staff, the student themself, and their linked parent.
    match /disciplinaryActions/{actionId} {
      allow read: if isSignedIn()
        && sameInstitution(resource.data.institutionId)
        && (isTeacherOrAbove()
          || resource.data.studentId == request.auth.uid
          || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId))));
      allow create: if isTeacherOrAbove() && writingToMyInstitution();
      allow update: if isAdminOrAbove()
        && sameInstitution(resource.data.institutionId)
        && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Reports (disabled — superseded by Report Cards) ───────────────────────
    // The /reports UI route has been removed. This rule locks the collection
    // to prevent stale data from being read or written.
    match /reports/{docId} {
      allow read, write: if false;
    }

    // ── Attendance ─────────────────────────────────────────────────────────
    // One record per student per school day. Documents must store classId
    // and departmentId at write time so the rules can resolve them.
    //
    // Write access:
    //   - admins: anywhere in their institution
    //   - class teacher: only for their class
    //   - senior teacher: anywhere in their department
    //
    // Read access:
    //   - teachers and admins: anywhere in their institution
    //   - student: their own records
    //   - parent: their linked child's records
    match /attendance/{recordId} {
      allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
        || isOwner(resource.data.studentId)
        || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)));

      allow create: if writingToMyInstitution()
        && (isAdminOrAbove()
          || isClassTeacherFor(request.resource.data.classId)
          || isSeniorTeacherFor(request.resource.data.departmentId));

      allow update: if sameInstitution(resource.data.institutionId)
        && (isAdminOrAbove()
          || isClassTeacherFor(resource.data.classId)
          || isSeniorTeacherFor(resource.data.departmentId))
        && institutionNotChanged();

      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── General Attendance Register ────────────────────────────────────────
    // One document per class + date + session (AM/PM).
    // Composite index required: institutionId ASC · classId ASC · date ASC · session ASC
    match /generalAttendance/{docId} {
      allow read: if isSignedIn()
        && sameInstitution(resource.data.institutionId)
        && (
          isAdminOrAbove()
          || isSeniorTeacher()
          || (
            // student: reads the full class document; client filters to own row
            myRole() == 'student'
            && get(/databases/$(database)/documents/users/$(request.auth.uid))
                 .data.classId == resource.data.classId
          )
          || (
            // parent: reads any document in their institution;
            // client filters to linked children only (rule-engine limitation)
            isParent()
          )
        );

      allow create, update: if isSignedIn()
        && writingToMyInstitution()
        && (
          isAdmin()
          || (
            isSeniorTeacher()
            && get(/databases/$(database)/documents/users/$(request.auth.uid))
                 .data.assignedClassId == request.resource.data.classId
          )
        );

      allow delete: if isSignedIn()
        && isAdmin()
        && sameInstitution(resource.data.institutionId);
    }

    // ── Subject Enrollments ────────────────────────────────────────────────
    // One document per subject-class pairing.
    // Doc ID: {subjectId}_{classId}
    // Schema: { institutionId, subjectId, subjectName, classId, className,
    //           enrollmentType, excludedStudentIds, excludedStudentNames,
    //           updatedAt, updatedBy }
    // enrollmentType: 'all' = entire class enrolled; 'selective' = class minus excludedStudentIds
    match /subjectEnrollments/{enrollmentId} {
      allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);

      allow create: if isAdminOrAbove() && writingToMyInstitution();

      allow update: if isAdminOrAbove()
        && sameInstitution(resource.data.institutionId)
        && institutionNotChanged();

      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Subject Attendance Register ────────────────────────────────────────
    // One document per subject + class + session date. No AM/PM split.
    // Composite index required: institutionId ASC · subjectId ASC · classId ASC · sessionDate ASC
    match /subjectAttendance/{docId} {
      allow read: if isSignedIn()
        && sameInstitution(resource.data.institutionId)
        && (
          isAdminOrAbove()
          || (
            myRole() == 'regular_teacher'
            && request.auth.uid in get(
                 /databases/$(database)/documents/subjects/$(resource.data.subjectId)
               ).data.teacherIds
          )
          || myRole() == 'student'  // client-side filtered to own records
          || isParent()             // client-side filtered to linked children
        );

      allow create, update: if isSignedIn()
        && writingToMyInstitution()
        && (
          isAdmin()
          || (
            myRole() == 'regular_teacher'
            && request.auth.uid == request.resource.data.teacherId
            && request.auth.uid in get(
                 /databases/$(database)/documents/subjects/$(request.resource.data.subjectId)
               ).data.teacherIds
          )
        );

      allow delete: if isSignedIn()
        && isAdmin()
        && sameInstitution(resource.data.institutionId);
    }

    // ── Attendance Summaries ──────────────────────────────────────────────────
    // Pre-computed per-student per-term totals (totalExpectedSessions, sessionsAbsent,
    // daysLate). Built by the admin Rebuild Summaries utility and used by
    // generateReportCard to populate attendance fields on the report card.
    // Read access mirrors report cards. Admin and senior_teacher may write
    // (the rebuild UI is admin-only; senior_teacher write access is reserved).
    //
    // resource == null guard: generateReportCard does a getDoc existence check on
    // this collection before any attendance has been saved. Without this branch,
    // CEL evaluates resource.data.institutionId as null → sameInstitution(null)
    // is false → PERMISSION_DENIED instead of "not found". Only teachers and
    // admins may perform the non-existent-doc probe; students and parents cannot
    // call generateReportCard so they are excluded from this branch.
    match /attendanceSummaries/{id} {
      allow read: if isSignedIn()
        && ((resource == null && isTeacherOrAbove())
            || (resource != null
                && sameInstitution(resource.data.institutionId)
                && (isTeacherOrAbove()
                  || resource.data.studentId == request.auth.uid
                  || (isParent()
                      && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId))))));
      allow create, update: if isSignedIn()
        && writingToMyInstitution()
        && (isAdmin() || isSeniorTeacher());
      allow delete: if isAdmin() && sameInstitution(resource.data.institutionId);
    }

    // ── Events ─────────────────────────────────────────────────────────────
    match /events/{eventId} {
      allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      allow update: if isAdminOrAbove() && sameInstitution(resource.data.institutionId) && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Announcements ──────────────────────────────────────────────────────
    match /announcements/{announcementId} {
      allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      allow update: if isAdminOrAbove() && sameInstitution(resource.data.institutionId) && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Timetable Slots ────────────────────────────────────────────────────────
    // Weekly recurring schedule slots scoped to a term. institution_admin manages
    // all slots for their institution. senior_teacher can manage slots when
    // canGenerateSchedule == true on their users/{uid} document (per-user
    // delegation). All signed-in users in the institution can read.
    // Note: the get() call in the senior_teacher branches counts as one extra
    // Firestore read per rule evaluation — same trade-off as Issue #46.
    match /timetable_slots/{slotId} {
      allow read: if isSignedIn()
        && sameInstitution(resource.data.institutionId);

      allow create: if (isAdminOrAbove() && sameInstitution(request.resource.data.institutionId))
        || (isSeniorTeacher()
            && sameInstitution(request.resource.data.institutionId)
            && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.canGenerateSchedule == true);

      allow update, delete: if (isAdminOrAbove() && sameInstitution(resource.data.institutionId))
        || (isSeniorTeacher()
            && sameInstitution(resource.data.institutionId)
            && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.canGenerateSchedule == true);
    }

    // ── Institutions ───────────────────────────────────────────────────────────
    // super_admin reads all (audit-log filter dropdown). All other signed-in
    // users may only read their own institution. super_admin can create or delete.
    // institution_admin can update their own institution (e.g. gradingSystem field — N-2).
    match /institutions/{institutionId} {
      allow read: if isSuperAdmin() || myInstitutionId() == institutionId;
      allow create: if isSuperAdmin();
      allow update: if isSuperAdmin()
        || (isAdmin() && myInstitutionId() == institutionId);
      allow delete: if isSuperAdmin();
    }

    // ── Audit log (institution-scoped subcollection) ───────────────────────────
    // The rules text lives in firestore.rules (see the note at the top of this file).
    // Summary, so this stays a record of WHY rather than a second copy of the rules:
    //   - admins write every event type; a teacher writes only the four teacher types
    //     (attendance_edit, results_edit, comment_edit, lesson_note_edit), so a teacher
    //     can never attribute a security event to themselves;
    //   - every writer passes validAuditEntry(): performedBy == request.auth.uid,
    //     recordedAt == request.time, an exact key set, detail <= 300 chars;
    //   - a teacher reads only entries they wrote (their list query must filter on
    //     performedBy); update and delete are denied for everyone.
    // The event-type lists must match AuditEventType in src/lib/firebase.ts;
    // src/lib/__tests__/auditRules.test.ts fails when they drift.

    // ── Collection Group: activity_log ─────────────────────────────────────────
    // Allows institution_admin and super_admin to query collectionGroup("activity_log").
    // super_admin: platform-wide. institution_admin: scoped to their institutionId.
    match /{path=**}/activity_log/{eventId} {
      allow read: if isSuperAdmin()
        || (isAdmin() && resource.data.institutionId == myInstitutionId());
    }

    // ── Collection Group: audit_log ────────────────────────────────────────────
    // Allows super_admin to query collectionGroup("audit_log") across all institutions.
    match /{path=**}/audit_log/{eventId} {
      allow read: if isSuperAdmin();
    }

    // ── Gradebooks ─────────────────────────────────────────────────────────
    // Parent document per class+subject+term combination (ID: classId_subjectId_termId).
    // Subcollection `columns` holds user-defined assessment columns.
    // Column delete is restricted to the column creator or institution_admin.
    match /gradebooks/{gradebookId} {
      allow read: if isTeacherOrAbove() && sameInstitution(resource.data.institutionId);
      allow create: if isTeacherOrAbove() && writingToMyInstitution();
      allow update: if isTeacherOrAbove() && sameInstitution(resource.data.institutionId);
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);

      match /columns/{colId} {
        allow read: if isTeacherOrAbove() && sameInstitution(resource.data.institutionId);
        allow create: if isTeacherOrAbove() && writingToMyInstitution();
        allow update: if isTeacherOrAbove() && sameInstitution(resource.data.institutionId);
        allow delete: if isSignedIn()
          && sameInstitution(resource.data.institutionId)
          && (isAdmin() || request.auth.uid == resource.data.createdBy);
      }
    }

    // ── Deny everything else ───────────────────────────────────────────────
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
