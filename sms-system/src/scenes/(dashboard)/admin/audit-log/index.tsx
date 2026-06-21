import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, collectionGroup, getDocs, orderBy, query, limit } from "firebase/firestore";
import type { QuerySnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AuditLogEntry, InstitutionDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";

type FilterOption = { id: string; name: string };

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })} - ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
};

const AuditLogPage = () => {
  const { role } = useAuth();
  const navigate = useNavigate();

  const [institutions, setInstitutions] = useState<FilterOption[]>([]);
  const [selected, setSelected] = useState<string>("__all__");
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (role !== "super_admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [role, navigate]);

  useEffect(() => {
    async function loadInstitutions() {
      const snap = await getDocs(collection(db, "institutions"));
      const list: FilterOption[] = snap.docs.map((d) => ({
        id: d.id,
        name: (d.data() as InstitutionDocument).name,
      }));
      list.sort((a, b) => {
        if (a.id === "_platform") return -1;
        if (b.id === "_platform") return 1;
        return a.name.localeCompare(b.name);
      });
      setInstitutions(list);
    }
    if (role === "super_admin") loadInstitutions();
  }, [role]);

  useEffect(() => {
    if (role !== "super_admin") return;

    async function fetchAuditLog() {
      setLoading(true);
      try {
        let snap: QuerySnapshot;
        if (selected === "__all__") {
          snap = await getDocs(
            query(collectionGroup(db, "audit_log"), orderBy("timestamp", "desc"), limit(50))
          );
        } else {
          snap = await getDocs(
            query(
              collection(db, "institutions", selected, "audit_log"),
              orderBy("timestamp", "desc"),
              limit(50)
            )
          );
        }
        setAuditEntries(snap.docs.map((d) => d.data() as AuditLogEntry));
      } finally {
        setLoading(false);
      }
    }
    fetchAuditLog();
  }, [selected, role]);

  if (role !== "super_admin") return null;

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="bg-white dark:bg-gray-800 rounded-md p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Audit Log</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Platform-wide admin actions. Showing the 50 most recent entries.
            </p>
          </div>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/40 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-sky-400"
          >
            <option value="__all__">All institutions</option>
            {institutions.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : auditEntries.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No audit entries found.</p>
        ) : (
          <div className="space-y-3">
            {auditEntries.map((item, i) => (
              <div
                key={`${item.eventType}-${item.timestamp}-${i}`}
                className="rounded-md border border-gray-100 dark:border-gray-700 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {item.detail}
                  </p>
                  <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                    {fmtDateTime(item.timestamp)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {item.eventType} · by {item.performedByName}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogPage;
