import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { GradingSystem, ReportCardDocument, ReportCardSubjectRow } from './firebase';
import {
  computeCWGrade,
  computeExamGrade,
  computeFinalGrade,
  computeGPA,
  letterGrade,
  nextTermStart,
} from './reportCardUtils';

export type GenerateOptions = {
  studentId: string;
  termId: string;
  institutionId: string;
  generatedBy: string;
  generatedByRole: string;
  generatedViaBatch?: boolean;
  // Provide when batch-generating to avoid redundant class-rank queries per student.
  existingClassReportCards?: ReportCardDocument[];
  // When true, classRank and classAverage are written as null. The batch caller must
  // do a post-generation pass to compute and write correct values for the full cohort.
  skipClassRankComputation?: boolean;
};

export type GenerateResult =
  | { ok: true; docId: string; warnings: string[] }
  | { ok: false; error: string };

export async function generateReportCard(opts: GenerateOptions): Promise<GenerateResult> {
  try {
  const warnings: string[] = [];

  // 1. Institution
  const instSnap = await getDoc(doc(db, 'institutions', opts.institutionId));
  if (!instSnap.exists()) return { ok: false, error: 'Institution not found.' };
  const inst = instSnap.data();
  if (!inst.profileComplete) {
    return { ok: false, error: 'Institution profile is incomplete. Complete it before generating report cards.' };
  }

  // 2. Student
  const studentSnap = await getDoc(doc(db, 'users', opts.studentId));
  if (!studentSnap.exists()) return { ok: false, error: 'Student not found.' };
  const student = studentSnap.data();

  // 2b. Resolve class name — student documents store classId but not className.
  let resolvedClassName = '';
  if (student.classId) {
    const classSnap = await getDoc(doc(db, 'classes', student.classId as string));
    if (classSnap.exists()) resolvedClassName = classSnap.data().name as string;
  }

  // 3. Term
  const termSnap = await getDoc(doc(db, 'terms', opts.termId));
  if (!termSnap.exists()) return { ok: false, error: 'Term not found.' };
  const term = termSnap.data();

  // 4. Academic year
  const yearSnap = term.academicYearId
    ? await getDoc(doc(db, 'academicYears', term.academicYearId))
    : null;
  const academicYear = yearSnap?.data();

  // 5. Attendance summary (pre-computed by attendanceSummaryUtils)
  const attSnap = await getDoc(
    doc(db, 'attendanceSummaries', `${opts.studentId}_${opts.termId}`),
  );
  if (!attSnap.exists()) {
    warnings.push(
      'Attendance summary not found. Sessions will show as 0. Run "Rebuild Summaries" from the admin dashboard.',
    );
  }
  const att = attSnap.data() ?? { totalExpectedSessions: 0, sessionsAbsent: 0, daysLate: 0 };

  // 6. Results
  const resultsSnap = await getDocs(
    query(
      collection(db, 'results'),
      where('studentId', '==', opts.studentId),
      where('termId', '==', opts.termId),
      where('institutionId', '==', opts.institutionId),
    ),
  );
  const results = resultsSnap.docs.map((d) => d.data());
  if (results.length === 0) {
    return { ok: false, error: 'No results found for this student in the selected term.' };
  }

  // 7. Feedback comments — conductGrade + commentNumber per subject
  const feedbackSnap = await getDocs(
    query(
      collection(db, 'feedback_comments'),
      where('studentId', '==', opts.studentId),
      where('termId', '==', opts.termId),
      where('institutionId', '==', opts.institutionId),
    ),
  );
  const feedbackBySubject: Record<string, { conductGrade: string; commentNumbers: number[] }> = {};
  feedbackSnap.docs.forEach((d) => {
    const fd = d.data();
    feedbackBySubject[fd.subjectId as string] = {
      conductGrade: fd.conductGrade as string,
      commentNumbers: (fd.commentNumbers as number[] | undefined)
        ?? (fd.commentNumber != null ? [fd.commentNumber as number] : []),
    };
  });

  // 8. Unique subject IDs from results
  const subjectIds = [...new Set(results.map((r) => r.subjectId as string))];

  // 9. Subject documents
  const subjectDocs: Record<
    string,
    { name: string; cwWeight: number; examWeight: number; teacherIds: string[]; teacherNames: string[] }
  > = {};
  await Promise.all(
    subjectIds.map(async (sid) => {
      const snap = await getDoc(doc(db, 'subjects', sid));
      if (snap.exists()) subjectDocs[sid] = snap.data() as typeof subjectDocs[string];
    }),
  );

  // 10. Per-subject grade rows
  const subjectRows: ReportCardSubjectRow[] = [];
  for (const sid of subjectIds) {
    const subj = subjectDocs[sid];
    if (!subj) continue;

    const subjectResults = results.filter((r) => r.subjectId === sid);
    const isGradebook = subjectResults.some((r) => r.source === 'gradebook');

    if (isGradebook) {
      const gradebookId = `${student.classId}_${sid}_${opts.termId}`;
      const columnsSnap = await getDocs(collection(db, 'gradebooks', gradebookId, 'columns'));
      const weightSum = columnsSnap.docs.reduce(
        (sum, d) => sum + (d.data().columnWeight as number),
        0,
      );
      if (Math.abs(weightSum - 100) > 0.01) {
        return {
          ok: false,
          error: `Gradebook for "${subj.name}" has column weights that sum to ${weightSum.toFixed(1)}%, not 100%. Adjust column weights before generating.`,
        };
      }
      const gradebookResults = subjectResults.filter(
        (r) => r.source === 'gradebook' && (r.maxScore as number) > 0,
      );
      const finalGrade =
        Math.round(
          gradebookResults.reduce(
            (sum, r) =>
              sum + ((r.score as number) / (r.maxScore as number)) * ((r.columnWeight as number) ?? 0),
            0,
          ) * 10,
        ) / 10;
      const fbSnap = await getDoc(
        doc(db, 'feedback_comments', `${opts.studentId}_${sid}_${opts.termId}`),
      );
      const fbData = fbSnap.data();
      if (!fbData) warnings.push(`No feedback comment found for subject "${subj.name}".`);
      const commentNumbers: number[] | null =
        fbData?.commentNumbers ??
        (fbData?.commentNumber != null ? [fbData.commentNumber as number] : null);
      subjectRows.push({
        subjectId: sid,
        subjectName: subj.name,
        teacherId: subj.teacherIds?.[0] ?? '',
        teacherName: subj.teacherNames?.[0] ?? '',
        cwWeight: subj.cwWeight ?? 50,
        examWeight: subj.examWeight ?? 50,
        cwGrade: null,
        examGrade: null,
        finalGrade,
        letterGrade: letterGrade(finalGrade),
        subjectPosition: null,
        conductGrade: (fbData?.conductGrade as ReportCardSubjectRow['conductGrade']) ?? null,
        commentNumbers,
      });
    } else {
      if (subj.cwWeight === undefined || subj.examWeight === undefined) {
        warnings.push(`Subject "${subj.name}" is missing Course Work / Exam weighting.`);
      }
      const typedResults = subjectResults as {
        assessmentType: 'coursework' | 'exam';
        score: number;
        maxScore: number;
      }[];
      const cwGrade = computeCWGrade(typedResults);
      const examGrade = computeExamGrade(typedResults);
      if (cwGrade === null && (subj.cwWeight ?? 50) > 0) {
        warnings.push(`"${subj.name}": no coursework results found — grade calculated from exam component only.`);
      }
      if (examGrade === null && (subj.examWeight ?? 50) > 0) {
        warnings.push(`"${subj.name}": no exam results found — grade calculated from coursework component only.`);
      }
      const finalGrade = computeFinalGrade(
        cwGrade,
        examGrade,
        subj.cwWeight ?? 50,
        subj.examWeight ?? 50,
      );
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
        // Subject position only computed accurately in batch flow where all
        // classmates' results are processed together — set null for single-student.
        subjectPosition: null,
        conductGrade: (fb?.conductGrade as ReportCardSubjectRow['conductGrade']) ?? null,
        commentNumbers: fb?.commentNumbers ?? null,
      });
    }
  }

  // 11. Section comments
  const commentsSnap = await getDocs(
    query(
      collection(db, 'reportCardComments'),
      where('studentId', '==', opts.studentId),
      where('termId', '==', opts.termId),
      where('institutionId', '==', opts.institutionId),
    ),
  );
  const comments = commentsSnap.docs[0]?.data() ?? {};

  // 12. Activities and responsibilities (parallel)
  const [activitiesSnap, responsibilitiesSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'studentActivities'),
        where('institutionId', '==', opts.institutionId),
        where('studentId', '==', opts.studentId),
        where('termId', '==', opts.termId),
      ),
    ),
    getDocs(
      query(
        collection(db, 'studentResponsibilities'),
        where('institutionId', '==', opts.institutionId),
        where('studentId', '==', opts.studentId),
        where('termId', '==', opts.termId),
      ),
    ),
  ]);

  // 13. Student average across all subjects.
  const studentAverage =
    subjectRows.length > 0
      ? subjectRows.reduce((s, r) => s + r.finalGrade, 0) / subjectRows.length
      : null;

  // 14. Class rank and average.
  //     Skipped during batch generation (skipClassRankComputation = true) to avoid
  //     order-dependent results — the batch caller computes and writes correct values
  //     for the full cohort after all cards have been generated.
  let classAverage: number | null = null;
  let classRank: number | null = null;

  if (!opts.skipClassRankComputation) {
    const classCards: ReportCardDocument[] =
      opts.existingClassReportCards ??
      (
        await getDocs(
          query(
            collection(db, 'reportCards'),
            where('classId', '==', student.classId),
            where('termId', '==', opts.termId),
            where('institutionId', '==', opts.institutionId),
          ),
        )
      ).docs.map((d) => d.data() as ReportCardDocument);

    const classmates = classCards.filter((c) => c.studentId !== opts.studentId);
    classAverage =
      classmates.length > 0
        ? (() => {
            const all = [...classmates.map((c) => c.studentAverage ?? 0), studentAverage ?? 0];
            return all.reduce((s, v) => s + v, 0) / all.length;
          })()
        : null;
    classRank =
      studentAverage !== null && classmates.length > 0
        ? classmates.filter((c) => (c.studentAverage ?? 0) > studentAverage).length + 1
        : null;
  }

  // 15. All terms — for next-term-start derivation
  const allTermsSnap = await getDocs(
    query(collection(db, 'terms'), where('institutionId', '==', opts.institutionId)),
  );
  const allTerms = allTermsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as {
    id: string;
    termNumber?: number;
    academicYearId?: string;
    startDate: string;
    status: string;
  }[];

  // 16. Class population (all students currently enrolled in the class)
  const classmatesSnap = await getDocs(
    query(
      collection(db, 'users'),
      where('institutionId', '==', opts.institutionId),
      where('classId', '==', student.classId),
      where('role', '==', 'student'),
    ),
  );

  // 17. Assemble payload
  const payload: Omit<ReportCardDocument, 'generatedAt'> & {
    generatedAt: ReturnType<typeof serverTimestamp>;
  } = {
    studentId: opts.studentId,
    studentName: student.name as string,
    institutionStudentId: student.institutionStudentId ?? null,
    dateOfBirth: student.dateOfBirth ?? null,
    classId: student.classId ?? '',
    className: resolvedClassName,
    classPopulation: classmatesSnap.size,
    houseId: student.houseId ?? null,
    houseName: student.houseName ?? null,
    termId: opts.termId,
    termName: term.name as string,
    academicYearId: term.academicYearId ?? '',
    academicYearName: academicYear?.name ?? '',
    nextTermStart: nextTermStart(term.termNumber, term.academicYearId, allTerms),
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
    principalLabel: inst.principalLabel ?? 'Principal',
    vicePrincipalLabel: inst.vicePrincipalLabel ?? 'Vice Principal',
    classSupervisorComment: (comments.classSupervisorComment as string) ?? '',
    gradeSupervisorComment: (comments.gradeSupervisorComment as string) ?? '',
    principalComment: (comments.principalComment as string) ?? '',
    vicePrincipalComment: (comments.vicePrincipalComment as string) ?? '',
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

  // 18. Upsert — update if a report card already exists for this student+term
  const existingSnap = await getDocs(
    query(
      collection(db, 'reportCards'),
      where('studentId', '==', opts.studentId),
      where('termId', '==', opts.termId),
      where('institutionId', '==', opts.institutionId),
    ),
  );
  let docId: string;
  if (existingSnap.empty) {
    const ref = await addDoc(collection(db, 'reportCards'), payload);
    docId = ref.id;
  } else {
    await updateDoc(existingSnap.docs[0].ref, payload);
    docId = existingSnap.docs[0].id;
  }

  return { ok: true, docId, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
