import {
  addDoc,
  deleteField,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { enrollmentDocId } from "@/lib/subjectEnrollments";
import { assistantFields } from "@/lib/subjectTeachers";
import type { EnrollmentsByClass, SubjectFormOutput, buildSubjectPayload } from "@/lib/subjectFormLogic";

// The writes of the subject form (components/forms/SubjectForm): the subject itself and, after it, one
// enrolment per class. The form keeps the checks before them and closing the form after; the sequence below is
// moved as it was, because the order is the point: the subject is saved first, then each class's enrolment,
// then the enrolments of classes the subject no longer has are removed.

async function writeEnrollments({
  institutionId,
  uid,
  subjectId,
  subjectName,
  classesToEnroll,
  enrollmentByClass,
}: {
  institutionId: string;
  uid: string;
  subjectId: string;
  subjectName: string;
  classesToEnroll: { id: string; name: string }[];
  enrollmentByClass: EnrollmentsByClass;
}) {
  for (const cls of classesToEnroll) {
    const enrollment: { type: 'all' | 'selective'; excludedIds: string[]; excludedNames: string[] } =
      enrollmentByClass[cls.id] ?? { type: 'all', excludedIds: [], excludedNames: [] };
    await setDoc(institutionDoc(institutionId, 'subjectEnrollments', `${subjectId}_${cls.id}`), {
      institutionId,
      subjectId,
      subjectName,
      classId: cls.id,
      className: cls.name,
      enrollmentType: enrollment.type,
      excludedStudentIds: enrollment.excludedIds,
      excludedStudentNames: enrollment.excludedNames,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });
  }

  // Writing only ever added enrollments: a class removed from the subject kept its
  // enrollment, so its students still saw this subject in By Subject. Remove the
  // enrollments of every class no longer enrolled (one query, one batch). A fresh
  // read, not the form's state, so it also clears ones left by earlier edits.
  const keep = new Set(classesToEnroll.map((c) => enrollmentDocId(subjectId, c.id)));
  const existing = await getDocs(
    query(institutionCollection(institutionId, 'subjectEnrollments'), where('subjectId', '==', subjectId)),
  );
  const stale = existing.docs.filter((d) => !keep.has(d.id));
  if (stale.length > 0) {
    const batch = writeBatch(db);
    stale.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/** Creates the subject, or updates the one whose id is `subjectId`, then writes its enrolments. */
export async function saveSubject({
  type,
  institutionId,
  uid,
  subjectId,
  formData,
  payload: fields,
  assistantId,
  classesToEnroll,
  enrollmentByClass,
}: {
  type: "create" | "update";
  institutionId: string;
  uid: string;
  subjectId: string | undefined;
  formData: SubjectFormOutput;
  payload: ReturnType<typeof buildSubjectPayload>;
  assistantId: string;
  classesToEnroll: { id: string; name: string }[];
  enrollmentByClass: EnrollmentsByClass;
}): Promise<void> {
  const payload = {
    ...fields,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  };
  // Only ever one of the ticked teachers; absent (create) or deleted (update) when none.
  const assistant = assistantFields(formData.teacherIds, formData.teacherNames, assistantId);

  if (type === "create") {
    const docRef = await addDoc(institutionCollection(institutionId, "subjects"), {
      ...payload,
      ...(assistant ?? {}),
      createdAt: serverTimestamp(),
      createdBy: uid,
    });
    await writeEnrollments({ institutionId, uid, subjectId: docRef.id, subjectName: formData.name, classesToEnroll, enrollmentByClass });
  } else {
    const id = subjectId as string;
    await updateDoc(
      institutionDoc(institutionId, "subjects", id),
      assistant
        ? { ...payload, ...assistant }
        : { ...payload, assistantTeacherId: deleteField(), assistantTeacherName: deleteField() },
    );
    await writeEnrollments({ institutionId, uid, subjectId: id, subjectName: formData.name, classesToEnroll, enrollmentByClass });
  }
}
