"use client";

import { Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useIsDark } from '@/lib/useTheme';
import { MoreHorizontal } from "lucide-react";
import type { CSSProperties } from 'react';

const data = [
  {
    name: "Jan",
    income: 4000,
    expense: 2400,
  },
  {
    name: "Feb",
    income: 3000,
    expense: 1398,
  },
  {
    name: "Mar",
    income: 2000,
    expense: 9800,
  },
  {
    name: "Apr",
    income: 2780,
    expense: 3908,
  },
  {
    name: "May",
    income: 1890,
    expense: 4800,
  },
  {
    name: "Jun",
    income: 2390,
    expense: 3800,
  },
  {
    name: "Jul",
    income: 3490,
    expense: 4300,
  },
  {
    name: "Aug",
    income: 3490,
    expense: 4300,
  },
  {
    name: "Sep",
    income: 3490,
    expense: 4300,
  },
  {
    name: "Oct",
    income: 3490,
    expense: 4300,
  },
  {
    name: "Nov",
    income: 3490,
    expense: 4300,
  },
  {
    name: "Dec",
    income: 3490,
    expense: 4300,
  },
];

const FinanceChart = () => {
  const isDark = useIsDark();
  const axisColor = isDark ? '#9CA3AF' : '#d1d5db';
  const gridColor = isDark ? '#374151' : '#ddd';
  const legendColor = isDark ? '#E5E7EB' : undefined;
  const tooltipStyle: CSSProperties = {
    backgroundColor: isDark ? '#1F2937' : '#fff',
    color: isDark ? '#E5E7EB' : '#111827',
    borderColor: isDark ? '#374151' : '#e5e7eb',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl w-full h-full p-4 flex flex-col min-h-0">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">Finance</h1>
        <Link
            to={"/"}
          >
          <MoreHorizontal className="w-5 h-5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors" />
        </Link>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tick={{ fill: axisColor }}
              tickLine={false}
              tickMargin={10}
            />
            <YAxis axisLine={false} tick={{ fill: axisColor }} tickLine={false}  tickMargin={20}/>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend align="center" verticalAlign="top" wrapperStyle={{ paddingTop: '10px', paddingBottom: '30px', color: legendColor }} />
            <Line
              type="monotone"
              dataKey="income"
              stroke="#C3EBFA"
              strokeWidth={5}
            />
            <Line type="monotone" dataKey="expense" stroke="#CFCEFF" strokeWidth={5}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FinanceChart;
