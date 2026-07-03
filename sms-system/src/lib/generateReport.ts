import {
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  FeedbackCommentDocument,
  GradingSystem,
  ReportDocument,
  ResultDocument,
} from '@/lib/firebase';
import {
  feedbackCommentCollection,
  institutionDoc,
  reportCardDoc,
  resultCollection,
  termDoc,
  userDoc,
} from '@/lib/firestorePaths';

export async function generateReport(
  studentId: string,
  termId: string,
  institutionId: string,
  departmentId: string | null,
  generatedBy: string,
  generatedByRole: 'institution_admin' | 'senior_teacher',
): Promise<void> {
  const [institutionSnap, studentSnap, termSnap] = await Promise.all([
    getDoc(institutionDoc(db, institutionId)),
    getDoc(userDoc(db, studentId)),
    getDoc(termDoc(db, institutionId, termId)),
  ]);
  const gradingSystem: GradingSystem = institutionSnap.data()?.gradingSystem ?? 'flat';
  const institutionName: string = institutionSnap.data()?.name ?? '';
  const studentName: string = studentSnap.data()?.name ?? '';
  const termName: string = termSnap.data()?.name ?? '';

  const resultsSnap = await getDocs(
    query(
      resultCollection(db, institutionId),
      where('studentId', '==', studentId),
      where('termId', '==', termId),
    ),
  );
  const grades = resultsSnap.docs.map((d) => d.data() as ResultDocument);

  const feedbackSnap = await getDocs(
    query(
      feedbackCommentCollection(db, institutionId),
      where('studentId', '==', studentId),
      where('termId', '==', termId),
    ),
  );
  const feedback = feedbackSnap.docs.map((d) => d.data() as FeedbackCommentDocument);

  const uniqueTeacherIds = [...new Set(feedback.map((f) => f.teacherId))];
  const teacherSnaps = await Promise.all(
    uniqueTeacherIds.map((uid) => getDoc(userDoc(db, uid))),
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

  await setDoc(reportCardDoc(db, institutionId, `${studentId}_${termId}`), payload);
}
