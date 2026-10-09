import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AuditLogEntry, InstitutionDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { institutionCollection } from "@/lib/paths";
import { useCursorPages } from "@/hooks/useCursorPages";
import {
  AUDIT_CATEGORY_LABELS,
  auditEventLabel,
  eventTypesForCategory,
  type AuditCategory,
} from "@/lib/auditEvents";
import EntryTime from "@/components/EntryTime";
import PagerControls from "@/components/PagerControls";

type FilterOption = { id: string; name: string };
type AuditRow = AuditLogEntry & { id: string };

const PAGE_SIZE = 20;
const ALL = "__all__";

const selectClassName =
  "rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900/40 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-sky-400";

const AuditLogPage = () => {
  const { role, institutionId } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = role === "super_admin";
  // An institution admin or a spectator reads only their own institution's log.
  const isInstitutionScoped = role === "institution_admin" || role === "spectator";

  const [institutions, setInstitutions] = useState<FilterOption[]>([]);
  const [selected, setSelected] = useState<string>(ALL);
  const [category, setCategory] = useState<AuditCategory>("all");

  useEffect(() => {
    if (!isSuperAdmin && !isInstitutionScoped) {
      navigate("/dashboard", { replace: true });
    }
  }, [isSuperAdmin, isInstitutionScoped, navigate]);

  // Only super_admin can list every institution or run a collectionGroup
  // query across all of them — institution_admin's own Firestore rules only
  // permit reading their own institution's audit_log directly, so their view
  // skips the picker/collectionGroup path entirely below rather than
  // attempting a query their rules would reject outright.
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
    if (isSuperAdmin) void loadInstitutions().catch(() => undefined);
  }, [isSuperAdmin]);

  const institutionNames = useMemo(
    () => Object.fromEntries(institutions.map((i) => [i.id, i.name])),
    [institutions],
  );

  const scope = isInstitutionScoped ? institutionId : selected;
  const canQuery = isSuperAdmin || (isInstitutionScoped && !!institutionId && institutionId !== "*");

  // Previous / Next over the log, newest first. Each page is a cached query (5
  // minutes), so paging back is free; "Refresh" re-reads the current page. The
  // category filter is an `eventType in [...]` query, served by the
  // eventType+timestamp indexes. Changing the institution or the category starts
  // again at page 1.
  const pages = useCursorPages<AuditRow>({
    queryKey: ["auditLog", role, scope, category],
    enabled: canQuery,
    pageSize: PAGE_SIZE,
    mapDoc: (snap) => ({ id: snap.id, ...(snap.data() as AuditLogEntry) }),
    fetchPage: async (cursor, fetchLimit) => {
      const base =
        isInstitutionScoped
          ? institutionCollection(institutionId!, "audit_log")
          : selected === ALL
            ? collectionGroup(db, "audit_log")
            : institutionCollection(selected, "audit_log");
      const types = eventTypesForCategory(category);
      const constraints: QueryConstraint[] = [
        ...(types ? [where("eventType", "in", types)] : []),
        orderBy("timestamp", "desc"),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(fetchLimit),
      ];
      return (await getDocs(query(base, ...constraints))).docs;
    },
  });

  if (!isSuperAdmin && !isInstitutionScoped) return null;

  const showInstitution = isSuperAdmin && selected === ALL;

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="bg-white dark:bg-gray-800 rounded-md p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Audit Log</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {isInstitutionScoped
                ? "Admin and staff actions for your institution, newest first."
                : "Platform-wide admin and staff actions, newest first."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as AuditCategory)}
              className={selectClassName}
              aria-label="Event category"
            >
              {(Object.keys(AUDIT_CATEGORY_LABELS) as AuditCategory[]).map((c) => (
                <option key={c} value={c}>
                  {AUDIT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            {isSuperAdmin && (
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className={selectClassName}
                aria-label="Institution"
              >
                <option value={ALL}>All institutions</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={pages.refresh}
              disabled={pages.isFetching}
              className="min-h-11 sm:min-h-0 px-3 py-2 rounded-md bg-slate-200 dark:bg-gray-700 text-xs font-semibold text-gray-700 dark:text-gray-200 disabled:opacity-50"
            >
              {pages.isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {pages.isLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : pages.isError ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-red-500">Failed to load the audit log. Please try again.</p>
            <button
              type="button"
              onClick={pages.refetch}
              className="min-h-11 sm:min-h-0 px-4 py-2 text-sm font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition"
            >
              Retry
            </button>
          </div>
        ) : pages.items.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No audit entries found.</p>
        ) : (
          <div className="space-y-3">
            {pages.items.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-gray-100 dark:border-gray-700 p-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 wrap-anywhere">
                    {item.detail}
                  </p>
                  <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500">
                    <EntryTime entry={item} />
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 wrap-anywhere">
                  {auditEventLabel(item.eventType)} · by {item.performedByName}
                  {item.targetName ? ` → ${item.targetName}` : ""}
                  {showInstitution && (
                    <span className="ml-2 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-200 px-2 py-0.5">
                      {institutionNames[item.institutionId] ?? item.institutionId}
                    </span>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}

        <PagerControls
          pageIndex={pages.pageIndex}
          hasPrevious={pages.hasPrevious}
          hasNext={pages.hasNext}
          isFetching={pages.isFetching && !pages.isLoading}
          onPrevious={pages.goPrevious}
          onNext={pages.goNext}
        />
      </div>
    </div>
  );
};

export default AuditLogPage;
