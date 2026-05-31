# Firebase Rules (As Seen In Firebase Console)

```
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
    function isSeniorTeacherFor(docDepartmentId) {
      let teacher = get(/databases/$(database)/documents/teachers/$(request.auth.uid)).data;
      return myRole() == 'senior_teacher'
        && teacher.departmentId == docDepartmentId;
    }

    // ── Users ──────────────────────────────────────────────────────────────
    match /users/{uid} {
      // Own profile always readable; admins only read within their institution
      allow read: if isOwner(uid)
        || (isAdminOrAbove() && sameInstitution(resource.data.institutionId));

      // super_admin can create any role; institution_admin is restricted to
      // non-privileged roles and cannot elevate to institution_admin or super_admin
      allow create: if isSuperAdmin()
        || (isAdmin() && writingToMyInstitution() && request.resource.data.role in ['senior_teacher', 'regular_teacher', 'student', 'parent']);

      // Users can edit their own profile but cannot change role or institutionId
      // Admins can edit any profile within their institution
      allow update: if (isOwner(uid) && roleNotChanged() && institutionNotChanged())
        || (isAdminOrAbove() && sameInstitution(resource.data.institutionId) && institutionNotChanged());

      // Only super admin can delete user documents
      allow delete: if isSuperAdmin();
    }

    // ── Activity log (per-user subcollection) ──────────────────────────────
    // Users read their own log. Admins read via Collection Group (see below).
    // Users write their own entries (sign-in, profile updates).
    // Admins cannot read individual subcollections via this rule — use Collection Group.
    match /users/{uid}/activity_log/{eventId} {
      allow read:   if isOwner(uid);
      allow create: if isOwner(uid)
        && request.resource.data.uid == uid
        && request.resource.data.keys().hasAll(['eventType','detail','timestamp','uid','institutionId']);
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
      allow update: if (isAdminOrAbove() || isOwner(teacherId))
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

    // ── Teacher-Subjects junction ──────────────────────────────────────────
    match /teacher_subjects/{docId} {
      allow read: if isSignedIn() && sameInstitution(resource.data.institutionId);
      allow create: if isAdminOrAbove() && writingToMyInstitution();
      allow update: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
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
    // Senior teachers may edit (including override) any result in their
    // department. Original teacherId should be preserved at creation so the
    // override history can be reconstructed from audit_logs.
    match /results/{resultId} {
      allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
        || resource.data.studentId == request.auth.uid
        || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)));
      allow create: if isTeacherOrAbove() && writingToMyInstitution();
      allow update: if sameInstitution(resource.data.institutionId)
        && (isAdminOrAbove()
          || (isTeacher() && resource.data.teacherId == request.auth.uid)
          || isSeniorTeacherFor(resource.data.departmentId))
        && institutionNotChanged();
      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
    }

    // ── Feedback Comments ──────────────────────────────────────────────────
    // Per-student narrative feedback submitted by teachers for a given term.
    // Upsert key: studentId + teacherId + classId + termId (enforced at app layer).
    // departmentId must be stored on the document at write time for
    // isSeniorTeacherFor() to resolve correctly on create and update.
    match /feedback_comments/{docId} {
      allow read: if (isTeacherOrAbove() && sameInstitution(resource.data.institutionId))
        || resource.data.studentId == request.auth.uid
        || (isParent() && exists(/databases/$(database)/documents/student_parents/$(request.auth.uid + '_' + resource.data.studentId)));

      allow create: if writingToMyInstitution()
        && (isAdminOrAbove()
          || isClassTeacherFor(request.resource.data.classId)
          || isSeniorTeacherFor(request.resource.data.departmentId));

      allow update: if sameInstitution(resource.data.institutionId)
        && (isAdminOrAbove()
          || (isTeacher() && resource.data.teacherId == request.auth.uid)
          || isSeniorTeacherFor(resource.data.departmentId))
        && institutionNotChanged();

      allow delete: if isAdminOrAbove() && sameInstitution(resource.data.institutionId);
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

    // ── Institutions ───────────────────────────────────────────────────────────
    // Readable by all signed-in users (needed to populate institution name in
    // the audit log filter dropdown). super_admin can create or delete.
    // institution_admin can update their own institution (e.g. gradingSystem field — N-2).
    match /institutions/{institutionId} {
      allow read: if isSignedIn();
      allow create: if isSuperAdmin();
      allow update: if isSuperAdmin()
        || (isAdmin() && myInstitutionId() == institutionId);
      allow delete: if isSuperAdmin();
    }

    // ── Audit log (institution-scoped subcollection) ───────────────────────────
    // institution_admin reads and writes their own institution's log.
    // super_admin reads and writes any institution's log.
    // Writes are batched with the primary change in the app layer.
    match /institutions/{institutionId}/audit_log/{eventId} {
      allow read: if isSuperAdmin()
        || (isAdmin() && myInstitutionId() == institutionId);
      allow create: if (isSuperAdmin() || (isAdmin() && myInstitutionId() == institutionId))
        && request.resource.data.institutionId == institutionId
        && request.resource.data.keys().hasAll([
             'eventType','detail','targetUid','targetName',
             'performedBy','performedByName','timestamp','institutionId'
           ]);
      allow update, delete: if false;
    }

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

    // ── Deny everything else ───────────────────────────────────────────────
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
