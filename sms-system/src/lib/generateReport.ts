import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  FeedbackCommentDocument,
  GradingSystem,
  ReportDocument,
  ResultDocument,
} from '@/lib/firebase';

export async function generateReport(
  studentId: string,
  termId: string,
  institutionId: string,
  departmentId: string | null,
  generatedBy: string,
  generatedByRole: 'institution_admin' | 'senior_teacher',
): Promise<void> {
  const institutionSnap = await getDoc(doc(db, 'institutions', institutionId));
  const gradingSystem: GradingSystem = institutionSnap.data()?.gradingSystem ?? 'flat';
  const institutionName: string = institutionSnap.data()?.name ?? '';

  const [studentSnap, termSnap] = await Promise.all([
    getDoc(doc(db, 'users', studentId)),
    getDoc(doc(db, 'terms', termId)),
  ]);
  const studentName: string = studentSnap.data()?.name ?? '';
  const termName: string = termSnap.data()?.name ?? '';

  const resultsSnap = await getDocs(
    query(
      collection(db, 'results'),
      where('studentId', '==', studentId),
      where('termId', '==', termId),
      where('institutionId', '==', institutionId),
    ),
  );
  const grades = resultsSnap.docs.map((d) => d.data() as ResultDocument);

  const feedbackSnap = await getDocs(
    query(
      collection(db, 'feedback_comments'),
      where('studentId', '==', studentId),
      where('termId', '==', termId),
      where('institutionId', '==', institutionId),
    ),
  );
  const feedback = feedbackSnap.docs.map((d) => d.data() as FeedbackCommentDocument);

  const uniqueTeacherIds = [...new Set(feedback.map((f) => f.teacherId))];
  const teacherSnaps = await Promise.all(
    uniqueTeacherIds.map((uid) => getDoc(doc(db, 'users', uid))),
  );
  const teacherNameById: Record<string, string> = Object.fromEntries(
    uniqueTeacherIds.map((uid, i) => [uid, teacherSnaps[i].data()?.name ?? '']),
  );
  const feedbackWithNames = feedback.map((f) => ({
    ...f,
    teacherName: teacherNameById[f.teacherId] ?? '',
  }));

  let overallScore = 0;
  if (grades.length > 0) {
    if (gradingSystem === 'flat') {
      overallScore = grades.reduce((acc, g) => acc + (g.score / g.maxScore) * 100, 0) / grades.length;
    } else {
      overallScore = grades.reduce((acc, g) => acc + (g.score / g.maxScore) * (g.weight ?? 1), 0) * 100;
    }
  }

  const existingSnap = await getDocs(
    query(
      collection(db, 'reports'),
      where('studentId', '==', studentId),
      where('termId', '==', termId),
      where('institutionId', '==', institutionId),
    ),
  );

  const payload: ReportDocument = {
    studentId,
    studentName,
    termId,
    termName,
    institutionId,
    institutionName,
    generatedAt: new Date().toISOString(),
    generatedBy,
    generatedByRole,
    gradingSystem,
    ...(departmentId !== null ? { departmentId } : {}),
    grades,
    feedback: feedbackWithNames,
    overallScore,
  };

  if (!existingSnap.empty) {
    await updateDoc(existingSnap.docs[0].ref, { ...payload });
  } else {
    await addDoc(collection(db, 'reports'), payload);
  }
}
