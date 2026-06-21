"use client";

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { USE_MOCK } from "@/lib/data";
import { MoreHorizontal, Users } from "lucide-react";

const MOCK_DATA = [
  { name: "Total", count: 106, fill: "white" },
  { name: "Girls", count: 53, fill: "#FAE27C" },
  { name: "Boys", count: 53, fill: "#C3EBFA" },
];

const CountChart = () => {
  const { institutionId } = useAuth();
  const [male, setMale] = useState(0);
  const [female, setFemale] = useState(0);
  const [unknown, setUnknown] = useState(0);

  useEffect(() => {
    if (USE_MOCK || !institutionId) return;
    return onSnapshot(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "student"),
      ),
      (snap) => {
        let m = 0,
          f = 0,
          u = 0;
        for (const d of snap.docs) {
          const g = d.data().gender;
          if (g === "Male") m++;
          else if (g === "Female") f++;
          else u++;
        }
        setMale(m);
        setFemale(f);
        setUnknown(u);
      },
    );
  }, [institutionId]);

  const total = USE_MOCK ? 106 : male + female + unknown;
  const chartData = USE_MOCK
    ? MOCK_DATA
    : [
        { name: "Total", count: total, fill: "white" },
        { name: "Female", count: female, fill: "#FAE27C" },
        { name: "Male", count: male, fill: "#C3EBFA" },
      ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl w-full h-full p-4 flex flex-col min-h-0">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold">Students</h1>
        <Link to="/dashboard/list/students">
          <MoreHorizontal className="w-5 h-5 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors" />
        </Link>
      </div>

      {!USE_MOCK && total === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center">
            No students yet.
          </p>
        </div>
      ) : (
        <>
          <div className="relative w-full flex-1 min-h-0">
            <ResponsiveContainer>
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="40%"
                outerRadius="100%"
                barSize={32}
                data={chartData}
              >
                <RadialBar background dataKey="count" />
              </RadialBarChart>
            </ResponsiveContainer>
            <Users className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-slate-400 dark:text-slate-600" />
          </div>
          <div className="flex flex-col gap-2 pl-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-lamaSky rounded-full shrink-0" />
              <span className="font-bold">{USE_MOCK ? "1,234" : male}</span>
              <span className="text-xs text-gray-400 dark:text-gray-400">
                Male{!USE_MOCK && total > 0 ? ` (${Math.round((male / total) * 100)}%)` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-lamaYellow rounded-full shrink-0" />
              <span className="font-bold">{USE_MOCK ? "1,234" : female}</span>
              <span className="text-xs text-gray-400 dark:text-gray-400">
                Female{!USE_MOCK && total > 0 ? ` (${Math.round((female / total) * 100)}%)` : ""}
              </span>
            </div>
            {!USE_MOCK && unknown > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-300 rounded-full shrink-0" />
                <span className="font-bold">{unknown}</span>
                <span className="text-xs text-gray-400 dark:text-gray-400">Unknown</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default CountChart;
