import { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import {
  db,
  ClassDocument,
  GeneralAttendanceDocument,
  TermDocument,
} from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { USE_MOCK } from "@/lib/data";
import { useSeniorTeacherProfile } from "@/hooks/useSeniorTeacherProfile";
import { PDFViewer, PDFDownloadLink } from "@react-pdf/renderer";
import {
  computeGridsheet,
  GridsheetData,
  GridsheetStudent,
} from "@/lib/attendanceGridsheet";
import { GridsheetPDF } from "./GridsheetPDF";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function surname(name: string): string {
  const parts = name.trim().split(" ");
  return parts[parts.length - 1].toLowerCase();
}

function formatMonthShort(mk: string): string {
  const [year, month] = mk.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
  });
}

function fmtTermRange(startISO: string, endISO: string): string {
  const [sy, sm] = startISO.split('-').map(Number);
  const [ey, em] = endISO.split('-').map(Number);
  const startAbbr = new Date(sy, sm - 1, 1)
    .toLocaleDateString('en-US', { month: 'short' })
    .toUpperCase();
  const endAbbr = new Date(ey, em - 1, 1)
    .toLocaleDateString('en-US', { month: 'short' })
    .toUpperCase();
  if (sy === ey) return `${startAbbr} - ${endAbbr} ${ey}`;
  return `${startAbbr} ${sy} - ${endAbbr} ${ey}`;
}

function formatMonthFull(mk: string): string {
  const [year, month] = mk.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

// ─── Small components ─────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="h-8 w-8 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
    </div>
  );
}

function InfoState({ message }: { message: string }) {
  return (
    <div className="p-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}

// ─── Table A: Student Monthly Totals ─────────────────────────────────────────

function StudentTotalsTable({ data }: { data: GridsheetData }) {
  const { studentRows, monthKeys } = data;

  if (studentRows.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="text-sm border-collapse">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-200 min-w-[160px] whitespace-nowrap border-r border-gray-200 dark:border-gray-700">
              Student
            </th>
            {monthKeys.map((mk) => (
              <th
                key={mk}
                className="px-3 py-2 text-center font-medium text-gray-700 dark:text-gray-200 min-w-[56px]"
              >
                {formatMonthShort(mk)}
              </th>
            ))}
            <th className="px-3 py-2 text-center font-semibold text-gray-900 dark:text-gray-100 min-w-[64px] border-l border-gray-200 dark:border-gray-700">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {studentRows.map((row) => (
            <tr
              key={row.studentId}
              className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap border-r border-gray-200 dark:border-gray-700">
                {row.studentName}
              </td>
              {monthKeys.map((mk) => (
                <td
                  key={mk}
                  className="px-3 py-2 text-center text-gray-700 dark:text-gray-300 tabular-nums"
                >
                  {row.monthlyPresent[mk] ?? 0}
                </td>
              ))}
              <td className="px-3 py-2 text-center font-semibold text-gray-900 dark:text-gray-100 tabular-nums border-l border-gray-200 dark:border-gray-700">
                {row.termTotal}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Table B: Class Session Summary ──────────────────────────────────────────

const MONTH_BAND_LIGHT = "bg-sky-50 dark:bg-sky-950/30";
const MONTH_BAND_MID = "bg-indigo-50 dark:bg-indigo-950/30";

function SessionSummaryTable({ data }: { data: GridsheetData }) {
  const { sessionEntries, monthKeys } = data;

  if (sessionEntries.length === 0) return null;

  const sessionsByMonth = monthKeys.map((mk) =>
    sessionEntries.filter((e) => e.monthKey === mk),
  );

  const rows: {
    label: string;
    getValue: (e: (typeof sessionEntries)[0]) => number;
  }[] = [
    { label: "Males", getValue: (e) => e.malesPresent },
    { label: "Females", getValue: (e) => e.femalesPresent },
    { label: "Total", getValue: (e) => e.totalPresent },
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="text-xs border-collapse">
        <thead>
          {/* Month group headers */}
          <tr>
            <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 px-3 py-2 min-w-[56px] border-r border-b border-gray-200 dark:border-gray-700" />
            {sessionsByMonth.map((sessions, i) => {
              const mk = monthKeys[i];
              const band = i % 2 === 0 ? MONTH_BAND_LIGHT : MONTH_BAND_MID;
              return (
                <th
                  key={mk}
                  colSpan={sessions.length}
                  className={`px-2 py-1.5 text-center font-semibold text-gray-700 dark:text-gray-200 border-b border-r border-gray-200 dark:border-gray-700 whitespace-nowrap ${band}`}
                >
                  {formatMonthFull(mk)}
                </th>
              );
            })}
          </tr>
          {/* Session labels: "1A" "1P" "2A" "2P" … */}
          <tr className="bg-gray-50 dark:bg-gray-800">
            <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 border-r border-gray-200 dark:border-gray-700" />
            {sessionsByMonth.map((sessions, i) => {
              const band = i % 2 === 0 ? MONTH_BAND_LIGHT : MONTH_BAND_MID;
              return sessions.map((se) => (
                <th
                  key={`${se.date}_${se.session}`}
                  className={`w-8 px-0.5 py-1 text-center font-medium text-gray-600 dark:text-gray-400 last:border-r border-gray-200 dark:border-gray-700 ${
                    se.session === "PM"
                      ? "border-r border-gray-200 dark:border-gray-700"
                      : ""
                  } ${band}`}
                  title={`${se.date} ${se.session}`}
                >
                  {se.dayIndex}
                  {se.session === "AM" ? "A" : "P"}
                </th>
              ));
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((row, ri) => (
            <tr
              key={row.label}
              className={
                ri === rows.length - 1
                  ? "bg-gray-50 dark:bg-gray-800 font-semibold"
                  : "bg-white dark:bg-gray-900"
              }
            >
              <td className="sticky left-0 z-10 px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap border-r border-gray-200 dark:border-gray-700 bg-inherit font-medium">
                {row.label}
              </td>
              {sessionsByMonth.map((sessions, i) => {
                const band = i % 2 === 0 ? MONTH_BAND_LIGHT : MONTH_BAND_MID;
                return sessions.map((se) => (
                  <td
                    key={`${se.date}_${se.session}`}
                    className={`w-8 px-0.5 py-1.5 text-center tabular-nums text-gray-700 dark:text-gray-300 ${
                      se.session === "PM"
                        ? "border-r border-gray-200 dark:border-gray-700"
                        : ""
                    } ${band}`}
                  >
                    {row.getValue(se)}
                  </td>
                ));
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AttendanceGridsheetPage() {
  const { role, institutionId } = useAuth();
  const {
    assignedClassId,
    assignedClassName,
    loading: profileLoading,
  } = useSeniorTeacherProfile();

  const [classes, setClasses] = useState<(ClassDocument & { id: string })[]>(
    [],
  );
  const [selectedClassId, setSelectedClassId] = useState("");

  const [terms, setTerms] = useState<(TermDocument & { id: string })[]>([]);
  const [selectedTermId, setSelectedTermId] = useState("");

  const [gridLoading, setGridLoading] = useState(false);
  const [gridData, setGridData] = useState<GridsheetData | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);

  const selectedTerm = terms.find((t) => t.id === selectedTermId) ?? null;

  const effectiveClassId =
    role === "senior_teacher" ? (assignedClassId ?? "") : selectedClassId;
  const effectiveClassName =
    role === "senior_teacher"
      ? (assignedClassName ?? "")
      : (classes.find((c) => c.id === selectedClassId)?.name ?? "");

  // Load classes (admin / super_admin)
  useEffect(() => {
    if (!institutionId || role === "senior_teacher") return;
    getDocs(
      query(
        collection(db, "classes"),
        where("institutionId", "==", institutionId),
      ),
    ).then((snap) =>
      setClasses(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as ClassDocument) })),
      ),
    );
  }, [institutionId, role]);

  // Load terms for institution
  useEffect(() => {
    if (!institutionId) return;
    getDocs(
      query(
        collection(db, "terms"),
        where("institutionId", "==", institutionId),
        orderBy("startDate", "desc"),
      ),
    ).then((snap) => {
      const loaded = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as TermDocument),
      }));
      setTerms(loaded);
      // Default to the active term
      const active = loaded.find((t) => t.status === "active");
      if (active) setSelectedTermId(active.id);
    });
  }, [institutionId]);

  // Load students + attendance docs when class + term are both selected
  useEffect(() => {
    if (!effectiveClassId || !selectedTermId || !institutionId) {
      setGridData(null);
      return;
    }
    const term = terms.find((t) => t.id === selectedTermId);
    if (!term) return;

    setGridLoading(true);
    setGridData(null);

    Promise.all([
      // Students in class (with gender)
      getDocs(
        query(
          collection(db, "users"),
          where("institutionId", "==", institutionId),
          where("role", "==", "student"),
          where("classId", "==", effectiveClassId),
        ),
      ),
      // All generalAttendance docs for the class within the term date range
      getDocs(
        query(
          collection(db, "generalAttendance"),
          where("institutionId", "==", institutionId),
          where("classId", "==", effectiveClassId),
          where("date", ">=", term.startDate),
          where("date", "<=", term.endDate),
        ),
      ),
    ])
      .then(([studentSnap, attendanceSnap]) => {
        const students: GridsheetStudent[] = studentSnap.docs
          .map((d) => {
            const data = d.data();
            return {
              uid: d.id,
              name: (data.name as string) ?? d.id,
              gender: (data.gender as "Male" | "Female" | null) ?? null,
            };
          })
          .sort((a, b) => surname(a.name).localeCompare(surname(b.name)));

        const attendanceDocs = attendanceSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as GeneralAttendanceDocument),
        }));

        setGridData(computeGridsheet(students, attendanceDocs));
      })
      .finally(() => setGridLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveClassId, selectedTermId, institutionId]);

  // ── Guard conditions ──
  if (USE_MOCK) {
    return (
      <InfoState message="Attendance Summary Register is not available in demo mode." />
    );
  }
  if (profileLoading) return <Spinner />;
  if (role === "senior_teacher" && !assignedClassId) {
    return (
      <InfoState message="You have no homeroom class assigned. Please contact your institution's administrator." />
    );
  }

  const hasNoData =
    !gridLoading && gridData !== null && gridData.studentRows.length === 0;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Attendance Summary Register
          </h1>
          {effectiveClassName && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {effectiveClassName}
            </p>
          )}
        </div>

        {/* Selectors + PDF button */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Class selector — admin / super_admin only */}
          {role !== "senior_teacher" && (
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Select a class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {/* Term selector */}
          <select
            value={selectedTermId}
            onChange={(e) => setSelectedTermId(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">Select a term…</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Preview Gridsheet */}
          <button
            type="button"
            disabled={!gridData || gridLoading}
            onClick={() => setPdfOpen(true)}
            className="rounded-md border border-sky-500 bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Preview Gridsheet
          </button>
        </div>
      </div>

      {/* States */}
      {!effectiveClassId && (
        <InfoState message="Select a class to view the register." />
      )}
      {effectiveClassId && !selectedTermId && (
        <InfoState message="Select a term to view the register." />
      )}
      {gridLoading && <Spinner />}
      {hasNoData && (
        <InfoState message="No attendance records found for this class and term." />
      )}

      {/* PDF preview modal */}
      {pdfOpen && gridData && selectedTerm && (
        <div className="fixed -top-8 inset-0 z-50 bg-gray-900/80 backdrop-blur-sm">
          <div
            className="absolute flex flex-col rounded-lg overflow-hidden shadow-xl"
            style={{
              width: "92vw",
              height: "90vh",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
            }}
          >
            {/* Modal header */}
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Attendance Summary Register
                {effectiveClassName ? ` — ${effectiveClassName}` : ""}
                {` — ${fmtTermRange(selectedTerm.startDate, selectedTerm.endDate)}`}
                {" — PDF Preview"}
              </span>
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  <PDFDownloadLink
                    document={
                      <GridsheetPDF
                        data={gridData}
                        termEndDate={selectedTerm.endDate}
                        className={effectiveClassName}
                      />
                    }
                    fileName={`attendance-register-${effectiveClassName || "class"}-${selectedTerm.name}.pdf`}
                  >
                    {({ loading }) => (
                      <button
                        type="button"
                        disabled={loading}
                        className="rounded-md border border-sky-500 bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50"
                      >
                        {loading ? "Preparing…" : "Download PDF"}
                      </button>
                    )}
                  </PDFDownloadLink>
                  <button
                    type="button"
                    onClick={() => setPdfOpen(false)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
            {/* PDF viewer */}
            <div className="min-h-0 flex-1">
              <PDFViewer width="100%" height="100%" showToolbar={false}>
                <GridsheetPDF
                  data={gridData}
                  termEndDate={selectedTerm.endDate}
                  className={effectiveClassName}
                />
              </PDFViewer>
            </div>
          </div>
        </div>
      )}

      {/* Tables */}
      {gridData && gridData.studentRows.length > 0 && (
        <>
          <section>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Student Monthly Totals
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Sessions where the student was marked Present (P) or Late (L).
            </p>
            <StudentTotalsTable data={gridData} />
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Class Session Summary
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Number of students present per session. Column labels: day index
              within month + A (AM) or P (PM). Students with no gender recorded
              are included in the Total row only.
            </p>
            <SessionSummaryTable data={gridData} />
          </section>
        </>
      )}
    </div>
  );
}
