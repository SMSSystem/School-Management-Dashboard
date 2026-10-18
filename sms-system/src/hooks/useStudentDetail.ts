import { useState, useEffect } from "react";
import { doc, onSnapshot, collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { fetchUserPhotoUrl } from "@/lib/userPhoto";
import { onLoadError } from "@/lib/reportError";
import { isTeacherRole } from "@/lib/departmentRequirement";
import type { Student, ParentLink, ParentOption } from "@/lib/studentDetailLogic";

// What the student detail page (scenes/(dashboard)/list/students/[id]) reads about the student: their
// document, photo, linked parents, and the institution's parents to choose from. Moved from the page as it was.
export function useStudentDetail(id: string | undefined) {
  const { role, institutionId } = useAuth();

  const [student, setStudent] = useState<Student | null>(null);
  const [studentLoading, setStudentLoading] = useState(true);
  // The student's own institution (a super_admin's is "*"), known once the student document
  // below has loaded. The photo and the parent links are both read with it.
  const studentInstitutionId = student?.institutionId;

  // Not part of the users/{uid} onSnapshot above — photos deliberately live
  // in their own subcollection doc (PHOTO_UPLOAD_SPEC.md §Background), so
  // this page needs its own fetch. refreshPhoto is passed to FormModal's
  // onClose so an edit-modal photo change shows up immediately instead of
  // staying stale until this page is reloaded (same fix as the list pages).
  // A student with no photo has no document, and a plain getDoc on a missing
  // photo is refused for staff (lib/userPhoto.ts), so this reads it with the
  // institution-filtered query.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const refreshPhoto = () => {
    if (!id || !studentInstitutionId) return;
    fetchUserPhotoUrl(id, studentInstitutionId).then(
      setPhotoUrl,
      onLoadError("the photo", undefined, { quiet: true }),
    );
  };
  useEffect(() => {
    refreshPhoto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, studentInstitutionId]);

  // Parent linking state
  const [parentLinks, setParentLinks] = useState<ParentLink[]>([]);
  const [allParents, setAllParents] = useState<ParentOption[]>([]);

  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(db, "users", id),
      (snap) => {
        setStudentLoading(false);
        if (snap.exists()) {
          setStudent({ uid: snap.id, ...snap.data() } as Student);
        } else {
          setStudent(null);
        }
      },
      onLoadError("this student", () => setStudentLoading(false)),
    );
  }, [id]);

  // Load parent links for this student. The read rule for student_parents (see
  // firestore.rules) holds only for a query that names the institution, so this
  // filters on the student's own institutionId: with `studentId ==` alone the
  // query is refused for every role except super_admin, and with no error
  // handler the list silently stayed empty. Waits until the student has loaded.
  useEffect(() => {
    if (!id || !studentInstitutionId) return;
    return onSnapshot(
      query(
        collection(db, "student_parents"),
        where("studentId", "==", id),
        where("institutionId", "==", studentInstitutionId),
      ),
      (snap) =>
        setParentLinks(
          snap.docs.map((d) => ({
            docId: d.id,
            parentId: d.data().parentId as string,
            relationship: d.data().relationship as ParentLink["relationship"],
          })),
        ),
      onLoadError("linked parents"),
    );
  }, [id, studentInstitutionId]);

  // Load all parents in institution for the add-parent dropdown. A teacher may read students only,
  // so the rules refuse this query for them (and only an institution admin can add a parent anyway).
  useEffect(() => {
    if (!institutionId || institutionId === "*" || isTeacherRole(role)) return;
    return onSnapshot(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "parent"),
      ),
      (snap) =>
        setAllParents(
          snap.docs
            .map((d) => ({
              uid: d.id,
              name: d.data().name as string,
              email: d.data().email as string | undefined,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      onLoadError("the parents to choose from"),
    );
  }, [institutionId, role]);

  return { student, studentLoading, studentInstitutionId, photoUrl, refreshPhoto, parentLinks, allParents };
}
