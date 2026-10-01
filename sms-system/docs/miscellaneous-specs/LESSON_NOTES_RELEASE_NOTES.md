# Lesson Notes + Users Lockdown — Release Notes and Deploy Order

Branch `lesson-notes-feat`. This release ships three things together: the Lesson Notes feature, required teacher departments, and a lockdown of the `users` document, activity log and audit log (including account deactivation). They share one `firestore.rules` file, so the deploy order matters.

## Deploy order (do not reorder)

1. **Indexes** — `firebase deploy --only firestore:indexes`. Adds three `lessonNotes` composite indexes (`teacherId`+`updatedAt`, `departmentId`+`teacherRole`+`updatedAt`, `classId`+`updatedAt`). Wait until all show **Enabled** in the Firebase Console; the Lesson Notes page fails for teachers, students and parents until they are built.
2. **App** — merge to `main` and let Vercel deploy. The new bundle sends a server-verified `recordedAt` on every activity/audit log write, which the new rules require.
3. **Rules** — `firebase deploy --only firestore:rules` (run `--dry-run` and review `git diff -- firestore.rules` first).
   - Deploying the rules before step 2 breaks sign-in logging, account creation and the super_admin profile save for anyone still on the old bundle.
4. **Verify** — `npx playwright test e2e/09-lesson-notes.spec.ts e2e/10-teacher-department.spec.ts e2e/11-users-lockdown.spec.ts`. The seven rule probes in spec 11 only pass once step 3 is done.

Rollback: redeploy the previous `firestore.rules`. No data migration is involved.

## Behaviour changes users will notice

- New **Lessons** page (Lesson Notes) for admins, teachers, students and parents; students and parents see notes for their class(es), read-only.
- Teachers must have a department when the institution has departments; admins see a "No department" badge and teachers see a warning.
- Admins can deactivate/reactivate teacher, student and parent accounts; an inactive account is signed out with an explanation.
- Users can no longer edit their own `classId`, `assignedClassId`, `canGenerateSchedule`, `status` and similar fields; an institution_admin can no longer edit another institution_admin.
- Stale browser tabs opened before step 2 must be reloaded or their log writes will be rejected.

## Free-tier notes

- Lesson note lists read at most the 100 most recent notes per query; attachments (base64, ≤500 KB) are fetched only when a note is opened.
- Deactivating an account patches the cached users list instead of refetching it.
- `useMyDepartment` reuses the user document `AuthContext` already reads at sign-in.
- The rules add no extra billed document reads beyond the existing `me()` lookup.

See `ISSUES_AND_GAPS.md` #38 and #39 and `docs/firebase/firebase-rules.md` for details and known limits.
