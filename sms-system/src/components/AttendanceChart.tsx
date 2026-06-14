"use client";

import { Link } from "react-router-dom";
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
import { useIsDark } from '@/lib/useTheme';
import { DATA_MODE } from "@/lib/data";
import type { CSSProperties } from 'react';

const data = [
  { name: "Mon", present: 60, absent: 40 },
  { name: "Tue", present: 70, absent: 60 },
  { name: "Wed", present: 90, absent: 75 },
  { name: "Thu", present: 90, absent: 75 },
  { name: "Fri", present: 65, absent: 55 },
];

const AttendanceChart = () => {
  const isDark = useIsDark();
  const axisColor = isDark ? '#9CA3AF' : '#d1d5db';
  const gridColor = isDark ? '#374151' : '#ddd';
  const legendColor = isDark ? '#E5E7EB' : undefined;
  const tooltipStyle: CSSProperties = {
    borderRadius: '10px',
    borderColor: isDark ? '#374151' : 'lightgray',
    backgroundColor: isDark ? '#1F2937' : '#fff',
    color: isDark ? '#E5E7EB' : '#111827',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 h-full flex flex-col min-h-0">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">Attendance</h1>
        <Link to="/list/events">
          <img
            src="/moreDark.png"
            alt=""
            width={20}
            height={20}
            className="hover:grayscale hover:brightness-50 hover:scale-105 transition-all invert-0 dark:invert"
          />
        </Link>
      </div>
      {DATA_MODE !== "mock" ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
            No data available in live mode.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tick={{ fill: axisColor }}
                tickLine={false}
              />
              <YAxis axisLine={false} tick={{ fill: axisColor }} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend align="left" verticalAlign="top" wrapperStyle={{ paddingTop: '20px', paddingBottom: '40px', color: legendColor }} />
              <Bar dataKey="present" fill="#FAE27C" legendType="circle" radius={[10, 10, 0, 0]} />
              <Bar dataKey="absent" fill="#C3EBFA" legendType="circle" radius={[10, 10, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default AttendanceChart;
