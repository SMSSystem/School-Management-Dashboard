"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useIsDark } from "@/lib/useTheme";
import { USE_MOCK } from "@/lib/data";
import { useAuth } from "@/lib/AuthContext";
import { useInstitutionAcademicCalendar } from "@/hooks/useInstitutionAcademicCalendar";
import type { CSSProperties } from "react";

type View = "calendar-week" | "term-week" | "last-30-days";

interface DayBar {
  label: string;
  amPresent: number;
  amAbsent: number;
  pmPresent: number;
  pmAbsent: number;
}

const MOCK_DATA: DayBar[] = [
  { label: "Mon", amPresent: 60, amAbsent: 10, pmPresent: 55, pmAbsent: 15 },
  { label: "Tue", amPresent: 70, amAbsent: 8,  pmPresent: 65, pmAbsent: 13 },
  { label: "Wed", amPresent: 80, amAbsent: 5,  pmPresent: 75, pmAbsent: 10 },
  { label: "Thu", amPresent: 75, amAbsent: 7,  pmPresent: 70, pmAbsent: 12 },
  { label: "Fri", amPresent: 65, amAbsent: 9,  pmPresent: 60, pmAbsent: 14 },
];

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getCalendarWeekDays(today: string): string[] {
  const d = new Date(today + "T12:00:00Z");
  const dow = d.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getTime() + mondayOffset * 86_400_000);
  return Array.from({ length: 5 }, (_, i) =>
    toISO(new Date(monday.getTime() + i * 86_400_000)),
  );
}

function getDayLabel(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

function getWeekLabel(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function getMondayOfWeek(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  const dow = d.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return toISO(new Date(d.getTime() + mondayOffset * 86_400_000));
}

function buildByDateSession(
  docs: { date: string; session: string; records: Record<string, { state: string }> }[],
): Record<string, { present: number; absent: number }> {
  const map: Record<string, { present: number; absent: number }> = {};
  for (const doc of docs) {
    const key = `${doc.date}_${doc.session}`;
    let present = 0, absent = 0;
    for (const rec of Object.values(doc.records ?? {})) {
      if (rec.state === "P" || rec.state === "L") present++;
      else absent++;
    }
    if (!map[key]) map[key] = { present: 0, absent: 0 };
    map[key].present += present;
    map[key].absent += absent;
  }
  return map;
}

function weekBarsFromMap(
  days: string[],
  map: Record<string, { present: number; absent: number }>,
): DayBar[] {
  return days.map((date) => ({
    label: getDayLabel(date),
    amPresent: map[`${date}_AM`]?.present ?? 0,
    amAbsent:  map[`${date}_AM`]?.absent  ?? 0,
    pmPresent: map[`${date}_PM`]?.present ?? 0,
    pmAbsent:  map[`${date}_PM`]?.absent  ?? 0,
  }));
}

function weeklyAggregation(
  dates: string[],
  map: Record<string, { present: number; absent: number }>,
): DayBar[] {
  const buckets: Record<string, DayBar> = {};
  for (const date of dates) {
    const monday = getMondayOfWeek(date);
    if (!buckets[monday]) {
      buckets[monday] = { label: getWeekLabel(monday), amPresent: 0, amAbsent: 0, pmPresent: 0, pmAbsent: 0 };
    }
    buckets[monday].amPresent += map[`${date}_AM`]?.present ?? 0;
    buckets[monday].amAbsent  += map[`${date}_AM`]?.absent  ?? 0;
    buckets[monday].pmPresent += map[`${date}_PM`]?.present ?? 0;
    buckets[monday].pmAbsent  += map[`${date}_PM`]?.absent  ?? 0;
  }
  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

const VIEW_LABELS: Record<View, string> = {
  "calendar-week": "This Week",
  "term-week":     "Term Week",
  "last-30-days":  "Last 30 Days",
};

const AttendanceChart = () => {
  const isDark = useIsDark();
  const { institutionId } = useAuth();
  const { activeTerm } = useInstitutionAcademicCalendar();

  const [view, setView] = useState<View>("calendar-week");
  const [chartData, setChartData] = useState<DayBar[]>(MOCK_DATA);
  const [loading, setLoading] = useState(false);

  const axisColor   = isDark ? "#9CA3AF" : "#d1d5db";
  const gridColor   = isDark ? "#374151" : "#ddd";
  const legendColor = isDark ? "#E5E7EB" : undefined;
  const tooltipStyle: CSSProperties = {
    borderRadius: "10px",
    borderColor: isDark ? "#374151" : "lightgray",
    backgroundColor: isDark ? "#1F2937" : "#fff",
    color: isDark ? "#E5E7EB" : "#111827",
  };

  useEffect(() => {
    if (USE_MOCK || !institutionId) return;

    const today = toISO(new Date());
    let dateStart: string;
    let dateEnd: string;
    let dates: string[] = [];

    if (view === "calendar-week") {
      const days = getCalendarWeekDays(today);
      dateStart = days[0];
      dateEnd = days[4];
      dates = days;
    } else if (view === "term-week") {
      const days = getCalendarWeekDays(today);
      const termStart = activeTerm?.startDate ?? today;
      const termEnd   = activeTerm?.endDate   ?? today;
      dates = days.filter((d) => d >= termStart && d <= termEnd);
      if (dates.length === 0) { setChartData([]); return; }
      dateStart = dates[0];
      dateEnd   = dates[dates.length - 1];
    } else {
      const d = new Date(today + "T12:00:00Z");
      const start = new Date(d.getTime() - 29 * 86_400_000);
      dateStart = toISO(start);
      dateEnd   = today;
      const day = new Date(start);
      while (toISO(day) <= today) {
        dates.push(toISO(day));
        day.setUTCDate(day.getUTCDate() + 1);
      }
    }

    setLoading(true);
    getDocs(
      query(
        collection(db, "generalAttendance"),
        where("institutionId", "==", institutionId),
        where("date", ">=", dateStart),
        where("date", "<=", dateEnd),
      ),
    ).then((snap) => {
      const raw = snap.docs.map((d) => ({
        date:    d.data().date    as string,
        session: d.data().session as string,
        records: d.data().records as Record<string, { state: string }>,
      }));
      const map = buildByDateSession(raw);
      const bars = view === "last-30-days"
        ? weeklyAggregation(dates, map)
        : weekBarsFromMap(dates, map);
      setChartData(bars);
    }).finally(() => setLoading(false));
  }, [institutionId, view, activeTerm]);

  const data = USE_MOCK ? MOCK_DATA : chartData;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 h-full flex flex-col min-h-0">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-lg font-semibold">Attendance</h1>
        <div className="flex items-center gap-1">
          {(Object.keys(VIEW_LABELS) as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                view === v
                  ? "bg-sky-500 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {!USE_MOCK && loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>
        </div>
      ) : !USE_MOCK && data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
            No attendance records for this period.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barSize={12}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tick={{ fill: axisColor, fontSize: 11 }}
                tickLine={false}
              />
              <YAxis axisLine={false} tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend
                align="left"
                verticalAlign="top"
                wrapperStyle={{ paddingTop: "10px", paddingBottom: "30px", color: legendColor, fontSize: 11 }}
              />
              <Bar dataKey="amPresent"  name="AM Present"  fill="#4ADE80" legendType="circle" radius={[4, 4, 0, 0]} />
              <Bar dataKey="amAbsent"   name="AM Absent"   fill="#F87171" legendType="circle" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pmPresent"  name="PM Present"  fill="#60A5FA" legendType="circle" radius={[4, 4, 0, 0]} />
              <Bar dataKey="pmAbsent"   name="PM Absent"   fill="#FB923C" legendType="circle" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default AttendanceChart;
