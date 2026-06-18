export type LetterGrade =
  | 'A+' | 'A' | 'A-'
  | 'B+' | 'B' | 'B-'
  | 'C+' | 'C' | 'C-'
  | 'D+' | 'D' | 'D-'
  | 'E';

export function letterGrade(score: number): LetterGrade {
  if (score >= 95) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 55) return 'C';
  if (score >= 50) return 'C-';
  if (score >= 45) return 'D+';
  if (score >= 40) return 'D';
  if (score >= 30) return 'D-';
  return 'E';
}

// 4.0 flat scale — +/- variants share the same points value.
export function gpaPoints(grade: LetterGrade): number {
  if (grade === 'A+' || grade === 'A' || grade === 'A-') return 4;
  if (grade === 'B+' || grade === 'B' || grade === 'B-') return 3;
  if (grade === 'C+' || grade === 'C' || grade === 'C-') return 2;
  if (grade === 'D+' || grade === 'D' || grade === 'D-') return 1;
  return 0;
}

export function computeGPA(subjects: { finalGrade: number }[]): number | null {
  if (subjects.length === 0) return null;
  const total = subjects.reduce((sum, s) => sum + gpaPoints(letterGrade(s.finalGrade)), 0);
  return Math.round((total / subjects.length) * 100) / 100;
}

export function computeCWGrade(
  results: { assessmentType: 'coursework' | 'exam'; score: number; maxScore: number }[],
): number | null {
  const cw = results.filter((r) => r.assessmentType === 'coursework' && r.maxScore > 0);
  if (cw.length === 0) return null;
  return cw.reduce((sum, r) => sum + (r.score / r.maxScore) * 100, 0) / cw.length;
}

export function computeExamGrade(
  results: { assessmentType: 'coursework' | 'exam'; score: number; maxScore: number }[],
): number | null {
  const exam = results.filter((r) => r.assessmentType === 'exam' && r.maxScore > 0);
  if (exam.length === 0) return null;
  return exam.reduce((sum, r) => sum + (r.score / r.maxScore) * 100, 0) / exam.length;
}

export function computeFinalGrade(
  cwGrade: number | null,
  examGrade: number | null,
  cwWeight: number,
  examWeight: number,
): number {
  const availableWeight = (cwGrade !== null ? cwWeight : 0) + (examGrade !== null ? examWeight : 0);
  if (availableWeight === 0) return 0;
  const cw   = cwGrade   !== null ? cwGrade   * (cwWeight   / availableWeight) : 0;
  const exam = examGrade !== null ? examGrade * (examWeight / availableWeight) : 0;
  return Math.round((cw + exam) * 10) / 10;
}

// Returns 1-based rank. Lower rank = higher score.
export function computeRanks(scores: { id: string; score: number }[]): Record<string, number> {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const ranks: Record<string, number> = {};
  sorted.forEach((s, i) => { ranks[s.id] = i + 1; });
  return ranks;
}

export function nextTermStart(
  currentTermNumber: number | undefined,
  currentAcademicYearId: string,
  allTerms: { id: string; termNumber?: number; academicYearId?: string; startDate: string; status: string }[],
): string | null {
  if (currentTermNumber !== undefined) {
    const next = allTerms.find(
      (t) => t.academicYearId === currentAcademicYearId && t.termNumber === currentTermNumber + 1,
    );
    if (next) return next.startDate;
  }
  const upcoming = allTerms
    .filter(
      (t) => t.academicYearId !== currentAcademicYearId &&
        (t.status === 'upcoming' || t.status === 'active'),
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return upcoming[0]?.startDate ?? null;
}
