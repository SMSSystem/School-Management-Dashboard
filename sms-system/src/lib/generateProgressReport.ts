import {
  addDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ProgressReportDocument, ProgressReportSubjectRow } from './firebase';
import { letterGrade } from './reportCardUtils';
import { institutionCollection, institutionDoc } from './paths';

// Progress Report generation (docs/progress-report/PROGRESS_REPORT_SPEC.md §4).
// Deliberately does not call, or share a collection with, generateReportCard() —
// see the spec's §2 for why (upsert-per-term vs. many immutable snapshots).

// §5.1 — reasonable default for "a handful of check-ins across one term";
// trivially tunable, not derived from any external requirement.
export const PROGRESS_REPORT_CAP_PER_STUDENT_TERM = 5;

export type GenerateProgressReportOptions = {
  studentId: string;
  termId: string;
  institutionId: string;
  generatedBy: string;
  generatedByName: string;
};

export type GenerateProgressReportResult =
  | { ok: true; docId: string; warnings: string[] }
  | { ok: false; error: string };

export async function generateProgressReport(
  opts: GenerateProgressReportOptions,
): Promise<GenerateProgressReportResult> {
  const warnings: string[] = [];
  try {
    // 1. Institution — unlike generateReportCard(), profileComplete is NOT
    // required (§4 step 1): a Progress Report is informal enough that it
    // shouldn't be blocked on the profile wizard being finished.
    const instSnap = await getDoc(doc(db, 'institutions', opts.institutionId));
    if (!instSnap.exists()) return { ok: false, error: 'Institution not found.' };
    const inst = instSnap.data();

    // 2. Student
    const studentSnap = await getDoc(doc(db, 'users', opts.studentId));
    if (!studentSnap.exists()) return { ok: false, error: 'Student not found.' };
    const student = studentSnap.data();

    // 3. Class name — student documents store classId but not className.
    let resolvedClassName = '';
    if (student.classId) {
      const classSnap = await getDoc(
        institutionDoc(opts.institutionId, 'classes', student.classId as string),
      );
      if (classSnap.exists()) resolvedClassName = classSnap.data().name as string;
    }

    // 4. Term
    const termSnap = await getDoc(institutionDoc(opts.institutionId, 'terms', opts.termId));
    if (!termSnap.exists()) return { ok: false, error: 'Term not found.' };
    const term = termSnap.data();

    // 5. Academic year
    const yearSnap = term.academicYearId
      ? await getDoc(institutionDoc(opts.institutionId, 'academicYears', term.academicYearId as string))
      : null;
    const academicYear = yearSnap?.data();

    // 6. Results — whatever's been entered so far; no date filtering needed,
    // this is naturally already a point-in-time query (§1.2).
    const resultsSnap = await getDocs(
      query(
        institutionCollection(opts.institutionId, 'results'),
        where('studentId', '==', opts.studentId),
        where('termId', '==', opts.termId),
      ),
    );
    const results = resultsSnap.docs.map((d) => d.data());
    if (results.length === 0) {
      return { ok: false, error: 'No results found for this student in the selected term yet.' };
    }

    // 7. Unique subject IDs + subject docs (deduped)
    const subjectIds = [...new Set(results.map((r) => r.subjectId as string))];
    const subjectDocs: Record<string, { name: string; teacherIds?: string[]; teacherNames?: string[] }> = {};
    await Promise.all(
      subjectIds.map(async (sid) => {
        const snap = await getDoc(institutionDoc(opts.institutionId, 'subjects', sid));
        if (snap.exists()) subjectDocs[sid] = snap.data() as (typeof subjectDocs)[string];
      }),
    );

    // 8. Per-subject average — a simple mean of (score / maxScore) * 100
    // across all of that subject's results so far. Deliberately not
    // Report Card's weighted coursework/exam final-grade formula (§4 step 8).
    const subjectRows: ProgressReportSubjectRow[] = [];
    for (const sid of subjectIds) {
      const subj = subjectDocs[sid];
      if (!subj) {
        warnings.push(`Skipped a subject (ID: ${sid}) — its subject record was not found.`);
        continue;
      }
      const subjectResults = results.filter((r) => r.subjectId === sid) as {
        score: number;
        maxScore: number;
      }[];
      const validResults = subjectResults.filter((r) => r.maxScore > 0);
      const average =
        validResults.length > 0
          ? Math.round(
              (validResults.reduce((s, r) => s + (r.score / r.maxScore) * 100, 0) / validResults.length) * 10,
            ) / 10
          : 0;
      subjectRows.push({
        subjectId: sid,
        subjectName: subj.name,
        teacherId: subj.teacherIds?.[0] ?? '',
        teacherName: subj.teacherNames?.[0] ?? '',
        average,
        letterGrade: letterGrade(average),
      });
    }
    subjectRows.sort((a, b) => a.subjectName.localeCompare(b.subjectName));

    // 9. Overall average — mean of the per-subject averages (§4 step 9).
    const overallAverage =
      subjectRows.length > 0
        ? Math.round((subjectRows.reduce((s, r) => s + r.average, 0) / subjectRows.length) * 10) / 10
        : null;

    // 10. Assemble payload
    const payload: Omit<ProgressReportDocument, 'generatedAt'> & {
      generatedAt: ReturnType<typeof serverTimestamp>;
    } = {
      institutionId: opts.institutionId,
      studentId: opts.studentId,
      studentName: student.name as string,
      classId: (student.classId as string) ?? '',
      className: resolvedClassName,
      termId: opts.termId,
      termName: term.name as string,
      academicYearId: (term.academicYearId as string) ?? '',
      academicYearName: (academicYear?.name as string) ?? '',
      institutionName: inst.name as string,
      institutionAddress: (inst.address as string) ?? null,
      institutionPhone: (inst.phone as string) ?? null,
      institutionLogoUrl: (inst.logoUrl as string) ?? null,
      authorizedSignature: inst.authorizedSignature ?? null,
      principalLabel: (inst.principalLabel as string) ?? 'Principal',
      subjects: subjectRows,
      overallAverage,
      generatedAt: serverTimestamp(),
      generatedBy: opts.generatedBy,
      generatedByName: opts.generatedByName,
    };

    // 11. Write — always a new document; never a query-then-upsert like
    // generateReportCard() (§3.1 — no uniqueness enforced by design).
    const ref = await addDoc(institutionCollection(opts.institutionId, 'progressReports'), payload);

    // 12. Cap enforcement (§5.1). Wrapped in its own try/catch — a transient
    // failure here (e.g. a network blip on the follow-up query/delete)
    // shouldn't turn an already-successful generation into a reported
    // failure; worst case the cap is briefly exceeded and self-corrects on
    // the next generation for this student+term.
    try {
      await enforceProgressReportCap(opts.institutionId, opts.studentId, opts.termId);
    } catch (err) {
      warnings.push(
        `Snapshot created, but retention cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { ok: true, docId: ref.id, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

// §5.1 — after every generation, trims anything past the cap for that
// studentId+termId, oldest first. Reuses the same composite index
// (studentId, termId, generatedAt desc) the spec's §7 defines for this exact
// query shape.
async function enforceProgressReportCap(
  institutionId: string,
  studentId: string,
  termId: string,
): Promise<void> {
  const snap = await getDocs(
    query(
      institutionCollection(institutionId, 'progressReports'),
      where('studentId', '==', studentId),
      where('termId', '==', termId),
      orderBy('generatedAt', 'desc'),
    ),
  );
  const overflow = snap.docs.slice(PROGRESS_REPORT_CAP_PER_STUDENT_TERM);
  if (overflow.length === 0) return;
  const batch = writeBatch(db);
  overflow.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
