import type { GeneralAttendanceDocument } from '@/lib/firebase';

export interface GridsheetStudent {
  uid: string;
  name: string;
  gender: 'Male' | 'Female' | null;
}

export interface GridsheetStudentRow {
  studentId: string;
  studentName: string;
  gender: 'Male' | 'Female' | null;
  monthlyPresent: Record<string, number>; // "YYYY-MM" → present session count (P + L)
  termTotal: number;
}

export interface GridsheetSessionEntry {
  date: string;         // "YYYY-MM-DD"
  session: 'AM' | 'PM';
  monthKey: string;     // "YYYY-MM"
  dayIndex: number;     // 1-based school day index within the month
  boysPresent: number;
  girlsPresent: number;
  totalPresent: number;
}

export interface GridsheetData {
  studentRows: GridsheetStudentRow[];
  sessionEntries: GridsheetSessionEntry[];
  monthKeys: string[];  // sorted unique "YYYY-MM" keys
}

function toMonthKey(dateISO: string): string {
  return dateISO.slice(0, 7);
}

/**
 * Derives the full term gridsheet from raw attendance documents and the student list.
 * P and L states both count as present. Null-gender students are included in
 * totalPresent only (not in boysPresent / girlsPresent).
 */
export function computeGridsheet(
  students: GridsheetStudent[],
  attendanceDocs: (GeneralAttendanceDocument & { id: string })[],
): GridsheetData {
  const studentMap = new Map(students.map(s => [s.uid, s]));

  const studentMonthly = new Map<string, Record<string, number>>();
  for (const s of students) studentMonthly.set(s.uid, {});

  const sessionCountMap = new Map<
    string,
    { boysPresent: number; girlsPresent: number; totalPresent: number }
  >();

  for (const d of attendanceDocs) {
    const monthKey = toMonthKey(d.date);
    const sk = `${d.date}_${d.session}`;

    if (!sessionCountMap.has(sk)) {
      sessionCountMap.set(sk, { boysPresent: 0, girlsPresent: 0, totalPresent: 0 });
    }
    const sc = sessionCountMap.get(sk)!;

    for (const [studentId, rec] of Object.entries(d.records)) {
      if (rec.state !== 'P' && rec.state !== 'L') continue;

      if (studentMonthly.has(studentId)) {
        const monthly = studentMonthly.get(studentId)!;
        monthly[monthKey] = (monthly[monthKey] ?? 0) + 1;
      }

      sc.totalPresent++;
      const student = studentMap.get(studentId);
      if (student?.gender === 'Male') sc.boysPresent++;
      else if (student?.gender === 'Female') sc.girlsPresent++;
    }
  }

  // Build session entries in chronological order (natural sort: YYYY-MM-DD_AM < YYYY-MM-DD_PM)
  const monthDayMap = new Map<string, Map<string, number>>();
  const sessionEntries: GridsheetSessionEntry[] = [];

  for (const sk of [...sessionCountMap.keys()].sort()) {
    const [date, session] = sk.split('_') as [string, 'AM' | 'PM'];
    const monthKey = toMonthKey(date);

    if (!monthDayMap.has(monthKey)) monthDayMap.set(monthKey, new Map());
    const dayMap = monthDayMap.get(monthKey)!;
    if (!dayMap.has(date)) dayMap.set(date, dayMap.size + 1);

    sessionEntries.push({
      date,
      session,
      monthKey,
      dayIndex: dayMap.get(date)!,
      ...sessionCountMap.get(sk)!,
    });
  }

  const studentRows: GridsheetStudentRow[] = students.map(s => {
    const monthly = studentMonthly.get(s.uid) ?? {};
    return {
      studentId: s.uid,
      studentName: s.name,
      gender: s.gender,
      monthlyPresent: monthly,
      termTotal: Object.values(monthly).reduce((a, b) => a + b, 0),
    };
  });

  const monthKeys = [...new Set(sessionEntries.map(e => e.monthKey))].sort();

  return { studentRows, sessionEntries, monthKeys };
}
