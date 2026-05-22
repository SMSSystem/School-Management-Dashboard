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
import { useIsDark } from "@/lib/useTheme";
import type { CSSProperties } from "react";

const data = [
  { name: "Jan", institutions: 12, users: 340 },
  { name: "Feb", institutions: 14, users: 420 },
  { name: "Mar", institutions: 15, users: 490 },
  { name: "Apr", institutions: 17, users: 580 },
  { name: "May", institutions: 19, users: 640 },
  { name: "Jun", institutions: 21, users: 720 },
  { name: "Jul", institutions: 24, users: 810 },
  { name: "Aug", institutions: 26, users: 890 },
  { name: "Sep", institutions: 28, users: 970 },
  { name: "Oct", institutions: 30, users: 1050 },
  { name: "Nov", institutions: 33, users: 1140 },
  { name: "Dec", institutions: 36, users: 1280 },
];

const GrowthChart = () => {
  const isDark = useIsDark();
  const axisColor = isDark ? "#9CA3AF" : "#6b7280";
  const gridColor = isDark ? "#374151" : "#ddd";
  const legendColor = isDark ? "#E5E7EB" : undefined;
  const tooltipStyle: CSSProperties = {
    backgroundColor: isDark ? "#1F2937" : "#fff",
    color: isDark ? "#E5E7EB" : "#111827",
    borderColor: isDark ? "#374151" : "#e5e7eb",
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl w-full h-full p-4 flex flex-col min-h-0">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Platform Growth</h2>
        <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full">
          Last 12 months
        </span>
      </div>
      <div className="flex-1 min-h-0 mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tick={{ fill: axisColor }}
              tickLine={false}
              tickMargin={10}
            />
            <YAxis
              yAxisId="left"
              axisLine={false}
              tick={{ fill: axisColor }}
              tickLine={false}
              tickMargin={10}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              axisLine={false}
              tick={{ fill: axisColor }}
              tickLine={false}
              tickMargin={10}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend
              align="center"
              verticalAlign="top"
              wrapperStyle={{
                paddingTop: "10px",
                paddingBottom: "30px",
                color: legendColor,
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="institutions"
              stroke="#0ea5e9"
              strokeWidth={4}
              dot={false}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="users"
              stroke="#818cf8"
              strokeWidth={4}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default GrowthChart;
