import { useState } from "react";
import { institutions, type Institution } from "./mockData";

const InstitutionsTable = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Institution["status"]>("all");

  const filtered = institutions.filter((inst) => {
    const matchesSearch =
      inst.name.toLowerCase().includes(search.toLowerCase()) ||
      inst.location.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || inst.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold shrink-0">Institutions</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="text-xs border border-gray-200 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-lamaSky"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <input
            type="search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-xs border border-gray-200 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-lamaSky w-32"
          />
        </div>
      </div>

      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full text-sm min-w-[500px]">
          <thead className="sticky top-0 bg-white dark:bg-gray-800 z-10">
            <tr className="text-left text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
              <th className="pb-2 pr-3 font-medium">Institution</th>
              <th className="pb-2 pr-3 font-medium">Users</th>
              <th className="pb-2 pr-3 font-medium hidden md:table-cell">Students</th>
              <th className="pb-2 pr-3 font-medium hidden lg:table-cell">Teachers</th>
              <th className="pb-2 pr-3 font-medium hidden md:table-cell">Last Active</th>
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  No institutions match your search.
                </td>
              </tr>
            ) : (
              filtered.map((inst) => (
                <tr
                  key={inst.id}
                  className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-lamaSkyLight dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-sky-600 dark:text-sky-400 shrink-0">
                        {inst.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-100 leading-tight">{inst.name}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">{inst.location}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3 font-semibold text-gray-700 dark:text-gray-200">{inst.users.toLocaleString()}</td>
                  <td className="py-3 pr-3 text-gray-600 dark:text-gray-300 hidden md:table-cell">{inst.students}</td>
                  <td className="py-3 pr-3 text-gray-600 dark:text-gray-300 hidden lg:table-cell">{inst.teachers}</td>
                  <td className="py-3 pr-3 text-gray-400 dark:text-gray-500 hidden md:table-cell text-xs">{inst.lastActivity}</td>
                  <td className="py-3 pr-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        inst.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      }`}
                    >
                      {inst.status}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      <button
                        aria-label={`View ${inst.name}`}
                        className="text-xs px-2 py-1 rounded-md bg-lamaSkyLight dark:bg-gray-700 text-sky-700 dark:text-sky-400 hover:opacity-80 transition-opacity font-medium"
                      >
                        View
                      </button>
                      <button
                        aria-label={`${inst.status === "active" ? "Suspend" : "Activate"} ${inst.name}`}
                        className={`text-xs px-2 py-1 rounded-md font-medium transition-opacity hover:opacity-80 ${
                          inst.status === "active"
                            ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                            : "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                        }`}
                      >
                        {inst.status === "active" ? "Suspend" : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pt-3 border-t border-gray-100 dark:border-gray-700 mt-2 flex items-center justify-between">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Showing {filtered.length} of {institutions.length} institutions
        </p>
        <button className="text-xs text-sky-600 dark:text-sky-400 hover:underline font-medium">
          View all
        </button>
      </div>
    </div>
  );
};

export default InstitutionsTable;
