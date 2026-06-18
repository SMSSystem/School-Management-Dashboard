import { useState } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { NonSchoolDayDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { rebuildSummariesForClass } from '@/lib/attendanceSummaryUtils';

interface Progress {
  done: number;
  total: number;
  students: number;
}

export default function RebuildAttendanceSummariesPage() {
  const { institutionId } = useAuth();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRebuild = async () => {
    if (!institutionId || institutionId === '*') return;
    setRunning(true);
    setError(null);
    setProgress(null);
    setDone(false);

    try {
      // 1. Fetch all terms (need startDate, endDate, academicYearId per termId)
      const termsSnap = await getDocs(
        query(collection(db, 'terms'), where('institutionId', '==', institutionId)),
      );
      const termMap: Record<string, { startDate: string; endDate: string; academicYearId: string }> = {};
      termsSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.startDate && data.endDate && data.academicYearId) {
          termMap[d.id] = {
            startDate: data.startDate as string,
            endDate: data.endDate as string,
            academicYearId: data.academicYearId as string,
          };
        }
      });

      // 2. Fetch all academic years (need schoolWeekDays per yearId)
      const yearsSnap = await getDocs(
        query(collection(db, 'academicYears'), where('institutionId', '==', institutionId)),
      );
      const yearMap: Record<string, { schoolWeekDays: number[] }> = {};
      yearsSnap.docs.forEach((d) => {
        yearMap[d.id] = {
          schoolWeekDays: (d.data().schoolWeekDays as number[] | undefined) ?? [1, 2, 3, 4, 5],
        };
      });

      // 3. Fetch all non-school days, grouped by academicYearId
      const nsdSnap = await getDocs(
        query(collection(db, 'nonSchoolDays'), where('institutionId', '==', institutionId)),
      );
      const nsdByYear: Record<string, NonSchoolDayDocument[]> = {};
      nsdSnap.docs.forEach((d) => {
        const data = d.data() as NonSchoolDayDocument;
        if (!nsdByYear[data.academicYearId]) nsdByYear[data.academicYearId] = [];
        nsdByYear[data.academicYearId].push(data);
      });

      // 4. Fetch all generalAttendance docs to discover unique (classId, termId) pairs
      const gaSnap = await getDocs(
        query(collection(db, 'generalAttendance'), where('institutionId', '==', institutionId)),
      );
      const pairs = new Map<string, { classId: string; termId: string }>();
      gaSnap.docs.forEach((d) => {
        const data = d.data();
        const classId = data.classId as string;
        const termId  = data.termId  as string;
        if (classId && termId) {
          pairs.set(`${classId}_${termId}`, { classId, termId });
        }
      });

      const total = pairs.size;
      if (total === 0) {
        setDone(true);
        setRunning(false);
        return;
      }

      setProgress({ done: 0, total, students: 0 });

      let completedPairs = 0;
      let totalStudents = 0;

      for (const { classId, termId } of pairs.values()) {
        const term = termMap[termId];
        if (!term) {
          completedPairs++;
          setProgress({ done: completedPairs, total, students: totalStudents });
          continue;
        }
        const year = yearMap[term.academicYearId];
        if (!year) {
          completedPairs++;
          setProgress({ done: completedPairs, total, students: totalStudents });
          continue;
        }

        const count = await rebuildSummariesForClass({
          classId,
          termId,
          academicYearId: term.academicYearId,
          institutionId,
          termStartDate: term.startDate,
          termEndDate: term.endDate,
          schoolWeekDays: year.schoolWeekDays,
          nonSchoolDays: nsdByYear[term.academicYearId] ?? [],
        });

        totalStudents += count;
        completedPairs++;
        setProgress({ done: completedPairs, total, students: totalStudents });
      }

      setDone(true);
    } catch {
      setError('Rebuild failed. Check your connection and try again.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Rebuild Attendance Summaries
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Aggregates all existing general attendance records for this institution and
          writes pre-computed summary documents to the{' '}
          <span className="font-mono text-xs">attendanceSummaries</span> collection.
          These summaries are required for accurate report card attendance figures.
        </p>
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
          Run this once after enabling report cards, or any time attendance data has been
          corrected in bulk. Going forward, summaries are updated automatically after
          each register save.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {done && !error && (
        <div className="mb-4 rounded-md bg-green-50 dark:bg-green-950/40 px-4 py-3 text-sm text-green-700 dark:text-green-300">
          Rebuild complete.{' '}
          {progress && (
            <>
              Processed {progress.total} class–term pair{progress.total !== 1 ? 's' : ''},{' '}
              wrote {progress.students} summary document{progress.students !== 1 ? 's' : ''}.
            </>
          )}
        </div>
      )}

      {progress && running && (
        <div className="mb-4 rounded-md bg-sky-50 dark:bg-sky-950/40 px-4 py-3 text-sm text-sky-700 dark:text-sky-300">
          Processing {progress.done} / {progress.total} class–term pairs…{' '}
          {progress.students > 0 && `${progress.students} summaries written so far.`}
        </div>
      )}

      <button
        type="button"
        onClick={handleRebuild}
        disabled={running}
        className="rounded-md bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {running ? 'Rebuilding…' : done ? 'Rebuild Again' : 'Start Rebuild'}
      </button>
    </div>
  );
}
