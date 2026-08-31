import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { fetchAcceptingInstitutions, type DirectoryOption } from "@/lib/registrationDirectory";
import { Search, X } from "lucide-react";

export default function RegistrationInstitutionPickerPage() {
  const location = useLocation();
  const [institutions, setInstitutions] = useState<DirectoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Set by the /register/:institutionId page's redirect-away effect when a
  // bookmarked/shared link no longer points at an institution accepting
  // registrations — dismissible so it doesn't linger across unrelated visits.
  const [redirectMessage, setRedirectMessage] = useState<string | null>(
    (location.state as { message?: string } | null)?.message ?? null,
  );

  useEffect(() => {
    fetchAcceptingInstitutions()
      .then(setInstitutions)
      .finally(() => setLoading(false));
  }, []);

  const filtered = institutions.filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-100 flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl px-8 py-10 sm:px-10">
          <h1 className="text-2xl font-bold text-slate-900 text-center mb-1.5">Register</h1>
          <p className="text-slate-500 text-sm text-center mb-6">
            Select the institution you'd like to register for.
          </p>

          {redirectMessage && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5">
              <p className="flex-1 text-sm text-amber-700">{redirectMessage}</p>
              <button
                type="button"
                onClick={() => setRedirectMessage(null)}
                className="shrink-0 text-amber-500 hover:text-amber-700"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {institutions.length > 3 && (
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 pointer-events-none" />
              <input
                type="text"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search institutions…"
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-slate-900 text-sm outline-none bg-slate-50 focus:border-slate-400 focus:ring-2 focus:ring-slate-900/8"
              />
            </div>
          )}

          {loading ? (
            <p className="text-center text-sm text-slate-400 py-8">Loading…</p>
          ) : institutions.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">
              No institutions are currently accepting online registration — please contact your school directly.
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">No institutions match "{search}".</p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {filtered.map((i) => (
                <li key={i.id}>
                  <Link
                    to={`/register/${i.id}`}
                    className="flex items-center gap-3 py-3 px-1 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                      <img src={i.logoUrl || "/logo.png"} alt="" className="w-7 h-7 object-contain" />
                    </div>
                    <span className="text-sm font-medium text-slate-800">{i.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 text-center">
            <Link to="/login" className="text-xs text-slate-400 hover:text-slate-600">
              ← Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
