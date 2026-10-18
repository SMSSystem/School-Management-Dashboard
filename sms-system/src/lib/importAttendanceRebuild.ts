import { getDoc, getDocs, query, where } from "firebase/firestore";
import type { NonSchoolDayDocument } from "@/types/institution";
import { institutionCollection, institutionDoc } from "@/lib/paths";
import { rebuildSummariesForClass } from "@/lib/attendanceSummaryUtils";
import type { GeneralAttendanceGroup } from "@/lib/importGeneralAttendance";
import type { GaRebuildProgress } from "@/lib/importConfig";

// The summary rebuild that follows a General Attendance import (scenes/(dashboard)/import). The page keeps
// the progress state and passes callbacks.

/** §9's required follow-up, auto-triggered per this session's confirmed choice — reuses RebuildAttendanceSummariesPage's own fetch pattern, scoped to just the (class, term) pairs this import actually touched. */
export async function runGeneralAttendanceRebuild(
institutionId_: string,
groups: GeneralAttendanceGroup[],
{ onProgress, onDone }: { onProgress: (progress: GaRebuildProgress) => void; onDone: () => void },
) {
  const pairs = new Map<string, { classId: string; termId: string }>();
  groups.forEach((g) => pairs.set(`${g.classId}_${g.termId}`, { classId: g.classId, termId: g.termId }));
  if (pairs.size === 0) return;

  onProgress({ done: 0, total: pairs.size, students: 0 });

  const termIds = Array.from(new Set(Array.from(pairs.values()).map((p) => p.termId)));
  const termDocs = await Promise.all(termIds.map((id) => getDoc(institutionDoc(institutionId_, "terms", id))));
  const termMap = new Map<string, { startDate: string; endDate: string; academicYearId: string }>();
  termDocs.forEach((snap) => {
    if (!snap.exists()) return;
    const data = snap.data() as Record<string, unknown>;
    termMap.set(snap.id, {
      startDate: data.startDate as string,
      endDate: data.endDate as string,
      academicYearId: data.academicYearId as string,
    });
  });

  const yearIds = Array.from(new Set(Array.from(termMap.values()).map((t) => t.academicYearId)));
  const yearDocs = await Promise.all(yearIds.map((id) => getDoc(institutionDoc(institutionId_, "academicYears", id))));
  const yearMap = new Map<string, { schoolWeekDays: number[] }>();
  yearDocs.forEach((snap) => {
    if (!snap.exists()) return;
    const data = snap.data() as Record<string, unknown>;
    yearMap.set(snap.id, { schoolWeekDays: (data.schoolWeekDays as number[] | undefined) ?? [1, 2, 3, 4, 5] });
  });

  const nsdByYear = new Map<string, NonSchoolDayDocument[]>();
  await Promise.all(
    yearIds.map(async (yearId) => {
      const snap = await getDocs(
        query(
          institutionCollection(institutionId_, "nonSchoolDays"),
          where("academicYearId", "==", yearId),
          where("isActive", "==", true),
        ),
      );
      nsdByYear.set(yearId, snap.docs.map((d) => d.data() as NonSchoolDayDocument));
    }),
  );

  let completed = 0;
  let totalStudents = 0;
  for (const { classId, termId } of pairs.values()) {
    const term = termMap.get(termId);
    const year = term ? yearMap.get(term.academicYearId) : undefined;
    if (term && year) {
      const count = await rebuildSummariesForClass({
        classId,
        termId,
        academicYearId: term.academicYearId,
        institutionId: institutionId_,
        termStartDate: term.startDate,
        termEndDate: term.endDate,
        schoolWeekDays: year.schoolWeekDays,
        nonSchoolDays: nsdByYear.get(term.academicYearId) ?? [],
      });
      totalStudents += count;
    }
    completed += 1;
    onProgress({ done: completed, total: pairs.size, students: totalStudents });
  }
  onDone();
}
