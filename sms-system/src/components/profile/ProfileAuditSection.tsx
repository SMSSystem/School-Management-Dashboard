import {
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import type { AuditLogEntry, Role } from "@/lib/firebase";
import { institutionCollection } from "@/lib/paths";
import { DATA_MODE, USE_MOCK, auditLogData } from "@/lib/data";
import { useCursorPages } from "@/hooks/useCursorPages";
import { SECURITY_EVENT_TYPES, auditEventLabel } from "@/lib/auditEvents";
import EntryTime from "@/components/EntryTime";
import PagerControls from "@/components/PagerControls";
import ProfileSection from "./ProfileSection";

const PAGE_SIZE = 10;
const AUDIT_LOG_PATH = "/dashboard/admin/audit-log";

type AuditRow = AuditLogEntry & { id: string };

const cardClass = "rounded-md border border-gray-100 dark:border-gray-700 p-3";
const listClass = "space-y-3 max-h-[28rem] overflow-y-auto pr-1";
const linkClass = "text-xs font-semibold text-sky-600 hover:underline";

// The profile's "Audit and security events" (admins only). An institution_admin
// sees their institution's account and security events, paged; routine record
// changes (attendance, grades, profile edits) live on the full Audit Log page. A
// super_admin has no single institution, so they get a link to that page instead.
const ProfileAuditSection = ({
  role,
  institutionId,
  retryKey,
}: {
  role: Role | null;
  institutionId: string | null;
  retryKey: number;
}) => {
  const isInstitutionAdmin = role === "institution_admin";
  const hasInstitution = !!institutionId && institutionId !== "*";

  const pages = useCursorPages<AuditRow>({
    queryKey: ["profileAudit", institutionId, retryKey],
    enabled: DATA_MODE === "live" && isInstitutionAdmin && hasInstitution,
    pageSize: PAGE_SIZE,
    mapDoc: (snap) => ({ id: snap.id, ...(snap.data() as AuditLogEntry) }),
    fetchPage: async (cursor, fetchLimit) => {
      const constraints: QueryConstraint[] = [
        where("eventType", "in", SECURITY_EVENT_TYPES),
        orderBy("timestamp", "desc"),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(fetchLimit),
      ];
      return (await getDocs(query(institutionCollection(institutionId!, "audit_log"), ...constraints))).docs;
    },
  });

  if (role !== "institution_admin" && role !== "super_admin") return null;

  const fullLogLink = (
    <a href={AUDIT_LOG_PATH} className={linkClass}>
      View full audit log →
    </a>
  );

  // Mock mode: the static list, unpaged.
  if (USE_MOCK && auditLogData.length > 0) {
    return (
      <ProfileSection title="Audit and security events" subtitle="Visible to admins only." action={fullLogLink}>
        <div className={listClass}>
          {auditLogData.map((item, i) => (
            <div key={`${item.eventType}-${item.timestamp}-${i}`} className={cardClass}>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{item.detail}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{auditEventLabel(item.eventType)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                <EntryTime entry={item} flagUnverified={false} />
              </p>
            </div>
          ))}
        </div>
      </ProfileSection>
    );
  }

  // A super_admin, or an institution_admin with nothing to show (or still
  // loading nothing): the explanatory card with a button to the full log.
  const showList = isInstitutionAdmin && (pages.isLoading || pages.isError || pages.items.length > 0 || pages.pageIndex > 0);
  if (!showList) {
    return (
      <ProfileSection title="Audit and security events" subtitle="Visible to admins only.">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          {role === "super_admin"
            ? "Platform-wide access — query audit events by institution on the audit log page."
            : "No recent account or security events for your institution — the full audit log page has the complete history."}
        </p>
        <a
          href={AUDIT_LOG_PATH}
          className="inline-flex items-center min-h-11 sm:min-h-0 px-4 py-2 text-sm font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition"
        >
          View audit log
        </a>
      </ProfileSection>
    );
  }

  return (
    <ProfileSection
      title="Audit and security events"
      subtitle="Account and security events. Visible to admins only."
      action={fullLogLink}
    >
      {pages.isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 min-h-16">Loading…</p>
      ) : pages.isError ? (
        <div className="flex flex-col items-start gap-2 min-h-16">
          <p className="text-sm text-red-500">Failed to load. Please try again.</p>
          <button
            type="button"
            onClick={pages.refetch}
            className="min-h-11 sm:min-h-0 px-4 py-2 text-xs font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className={listClass}>
          {pages.items.map((item) => (
            <div key={item.id} className={cardClass}>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 wrap-anywhere">{item.detail}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 wrap-anywhere">
                {auditEventLabel(item.eventType)} · by {item.performedByName}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                <EntryTime entry={item} />
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
    </ProfileSection>
  );
};

export default ProfileAuditSection;
