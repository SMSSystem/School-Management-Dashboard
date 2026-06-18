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
  malesPresent: number;
  femalesPresent: number;
  totalPresent: number;
}

export interface GridsheetData {
  studentRows: GridsheetStudentRow[];
  sessionEntries: GridsheetSessionEntry[];
  monthKeys: string[];  // sorted unique "YYYY-MM" keys
}

export interface GridsheetPDFDayRow {
  dayNum: number;  // 1–31
  // Total sessions (M+F, AM+PM) for each month on this calendar day. null = no school that day.
  monthDayTotals: Record<string, number | null>;
  // Per-session breakdown per month. null = no attendance doc for that session.
  monthSessions: Record<string, {
    malesAM: number | null;
    malesPM: number | null;
    femalesAM: number | null;
    femalesPM: number | null;
  }>;
  malesTotal: number | null;   // day-wide Males total across all months; null if no school at all
  femalesTotal: number | null; // day-wide Females total across all months; null if no school at all
}

function toMonthKey(dateISO: string): string {
  return dateISO.slice(0, 7);
}

/**
 * Derives the full term gridsheet from raw attendance documents and the student list.
 * P and L states both count as present. Null-gender students are included in
 * totalPresent only (not in malesPresent / femalesPresent).
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
    { malesPresent: number; femalesPresent: number; totalPresent: number }
  >();

  for (const d of attendanceDocs) {
    const monthKey = toMonthKey(d.date);
    const sk = `${d.date}_${d.session}`;

    if (!sessionCountMap.has(sk)) {
      sessionCountMap.set(sk, { malesPresent: 0, femalesPresent: 0, totalPresent: 0 });
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
      if (student?.gender === 'Male') sc.malesPresent++;
      else if (student?.gender === 'Female') sc.femalesPresent++;
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

/**
 * Transforms GridsheetData into a 31-row calendar-day matrix for PDF rendering.
 * Each row corresponds to a calendar day (1–31). Session data is keyed by monthKey.
 * null means no attendance document existed (non-school day / weekend / holiday).
 * 0 means a document existed but zero students were present.
 */
export function computeGridsheetPDF(data: GridsheetData): GridsheetPDFDayRow[] {
  type SessionData = {
    malesAM: number | null;
    malesPM: number | null;
    femalesAM: number | null;
    femalesPM: number | null;
  };

  // Build lookup: "<monthKey>_<dayNum>" → per-session counts
  const sessionLookup = new Map<string, SessionData>();

  for (const entry of data.sessionEntries) {
    const dayNum = parseInt(entry.date.slice(8), 10);
    const key = `${entry.monthKey}_${dayNum}`;
    if (!sessionLookup.has(key)) {
      sessionLookup.set(key, {
        malesAM: null, malesPM: null, femalesAM: null, femalesPM: null,
      });
    }
    const sd = sessionLookup.get(key)!;
    if (entry.session === 'AM') {
      sd.malesAM = entry.malesPresent;
      sd.femalesAM = entry.femalesPresent;
    } else {
      sd.malesPM = entry.malesPresent;
      sd.femalesPM = entry.femalesPresent;
    }
  }

  const rows: GridsheetPDFDayRow[] = [];

  for (let day = 1; day <= 31; day++) {
    const monthDayTotals: Record<string, number | null> = {};
    const monthSessions: Record<string, SessionData> = {};
    let malesTotal = 0;
    let femalesTotal = 0;
    let hasAnyData = false;

    for (const mk of data.monthKeys) {
      const sd = sessionLookup.get(`${mk}_${day}`);
      if (sd) {
        hasAnyData = true;
        const mAM = sd.malesAM ?? 0;
        const mPM = sd.malesPM ?? 0;
        const fAM = sd.femalesAM ?? 0;
        const fPM = sd.femalesPM ?? 0;
        monthDayTotals[mk] = mAM + mPM + fAM + fPM;
        monthSessions[mk] = sd;
        malesTotal += mAM + mPM;
        femalesTotal += fAM + fPM;
      } else {
        monthDayTotals[mk] = null;
        monthSessions[mk] = { malesAM: null, malesPM: null, femalesAM: null, femalesPM: null };
      }
    }

    rows.push({
      dayNum: day,
      monthDayTotals,
      monthSessions,
      malesTotal: hasAnyData ? malesTotal : null,
      femalesTotal: hasAnyData ? femalesTotal : null,
    });
  }

  return rows;
}
