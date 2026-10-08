import { Link } from "react-router-dom";
import { Eye } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

// Placeholder home for the read-only spectator role
// (docs/miscellaneous-specs/SPECTATOR_ROLE_SPEC.md, Phase 3). It deliberately
// has no create shortcuts and no cards that lead to editing screens; the full
// read-only dashboard replaces it in Phase 3 item 4.
const QUICK_LINKS = [
  { label: "Students", href: "/dashboard/list/students" },
  { label: "Classes", href: "/dashboard/list/classes" },
  { label: "Results", href: "/dashboard/list/results" },
  { label: "Report Cards", href: "/dashboard/report-cards" },
  { label: "Audit Log", href: "/dashboard/admin/audit-log" },
];

const SpectatorPage = () => {
  const { institution, displayName } = useAuth();
  return (
    <div className="p-3 sm:p-4">
      <section className="bg-white dark:bg-gray-800 rounded-md p-6 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Eye className="w-6 h-6 text-sky-600" aria-hidden="true" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {institution?.name ?? "Your institution"}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {displayName ? `Welcome, ${displayName}. ` : ""}You have read-only access: you can view
              information across the institution but cannot change anything.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((l) => (
            <Link
              key={l.href}
              to={l.href}
              className="px-3 py-1.5 rounded-md text-sm bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-200 dark:hover:bg-sky-900/50"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export default SpectatorPage;
