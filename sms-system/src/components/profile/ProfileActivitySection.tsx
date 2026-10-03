import { useState } from "react";
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
import { db, type ActivityLogEntry, type AuditLogEntry, type Role } from "@/lib/firebase";
import { institutionCollection } from "@/lib/paths";
import { DATA_MODE, USE_MOCK } from "@/lib/data";
import { useCursorPages } from "@/hooks/useCursorPages";
import { activityEventLabel, auditEventLabel } from "@/lib/auditEvents";
import EntryTime from "@/components/EntryTime";
import PagerControls from "@/components/PagerControls";
import ProfileSection from "./ProfileSection";

const PAGE_SIZE = 10;

type ActivityRow = ActivityLogEntry & { id: string };
type PerformedRow = AuditLogEntry & { id: string };
type View = "mine" | "performed";

const STAFF_ROLES: Role[] = ["super_admin", "institution_admin", "senior_teacher", "regular_teacher"];

const cardClass = "rounded-md border border-gray-100 dark:border-gray-700 p-3";
// The list scrolls inside its card; the pager sits OUTSIDE the scroll area so it
// is always visible and the card never grows past this height.
const listClass = "space-y-3 max-h-[28rem] overflow-y-auto pr-1";

const tabClass = (active: boolean) =>
  `min-h-11 sm:min-h-0 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
    active
      ? "bg-sky-600 text-white"
      : "bg-slate-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-slate-300 dark:hover:bg-gray-600"
  }`;

// The profile's Activity section. Everyone sees "My activity" (their own sign-ins
// and profile updates). Staff also get "Actions I performed": what THEY changed on
// other people's data, read from the institution's audit_log by performedBy (a
// super_admin across institutions). Each list is paged on its own, and only the
// list on screen is read: "Actions I performed" costs nothing until it is opened.
const ProfileActivitySection = ({
  uid,
  role,
  institutionId,
  retryKey,
  mockActivity,
}: {
  uid: string | undefined;
  role: Role | null;
  institutionId: string | null;
  // Bumped by the page's Retry; starts both lists again.
  retryKey: number;
  // Mock mode shows this static list instead (no queries, no paging).
  mockActivity: ActivityLogEntry[];
}) => {
  const [view, setView] = useState<View>("mine");
  const live = DATA_MODE === "live" && !!uid;
  const isStaff = !!role && STAFF_ROLES.includes(role);
  const isSuperAdmin = role === "super_admin";
  const hasInstitution = !!institutionId && institutionId !== "*";
  const canSeePerformed = live && isStaff && (isSuperAdmin || hasInstitution);

  const mine = useCursorPages<ActivityRow>({
    queryKey: ["profileActivity", uid, retryKey],
    enabled: live && view === "mine",
    pageSize: PAGE_SIZE,
    mapDoc: (snap) => ({ id: snap.id, ...(snap.data() as ActivityLogEntry) }),
    fetchPage: async (cursor, fetchLimit) => {
      const constraints: QueryConstraint[] = [
        orderBy("timestamp", "desc"),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(fetchLimit),
      ];
      return (await getDocs(query(collection(db, "users", uid!, "activity_log"), ...constraints))).docs;
    },
  });

  const performed = useCursorPages<PerformedRow>({
    queryKey: ["profilePerformed", role, institutionId, uid, retryKey],
    enabled: canSeePerformed && view === "performed",
    pageSize: PAGE_SIZE,
    mapDoc: (snap) => ({ id: snap.id, ...(snap.data() as AuditLogEntry) }),
    fetchPage: async (cursor, fetchLimit) => {
      const base = isSuperAdmin
        ? collectionGroup(db, "audit_log")
        : institutionCollection(institutionId!, "audit_log");
      const constraints: QueryConstraint[] = [
        where("performedBy", "==", uid),
        orderBy("timestamp", "desc"),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(fetchLimit),
      ];
      return (await getDocs(query(base, ...constraints))).docs;
    },
  });

  // Mock mode: the static list, unpaged, hidden when empty (as before).
  if (USE_MOCK) {
    if (mockActivity.length === 0) return null;
    return (
      <ProfileSection title="Activity" subtitle="Recent logins and profile updates.">
        <div className={listClass}>
          {mockActivity.map((item, i) => (
            <div key={`${item.eventType}-${item.timestamp}-${i}`} className={cardClass}>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                {activityEventLabel(item.eventType)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 wrap-anywhere">{item.detail}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                <EntryTime entry={item} flagUnverified={false} />
              </p>
            </div>
          ))}
        </div>
      </ProfileSection>
    );
  }

  // A student or parent with no activity yet has nothing to show (and no tabs).
  const showTabs = canSeePerformed;
  if (!showTabs && !mine.isLoading && !mine.isError && mine.items.length === 0 && mine.pageIndex === 0) {
    return null;
  }

  const current = view === "performed" && showTabs ? performed : mine;
  const subtitle =
    view === "performed" && showTabs
      ? "What you changed on other accounts and records."
      : "Recent logins and profile updates.";

  return (
    <ProfileSection title="Activity" subtitle={subtitle}>
      {showTabs && (
        <div className="flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Activity views">
          <button type="button" role="tab" aria-selected={view === "mine"} className={tabClass(view === "mine")} onClick={() => setView("mine")}>
            My activity
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "performed"}
            className={tabClass(view === "performed")}
            onClick={() => setView("performed")}
          >
            Actions I performed
          </button>
        </div>
      )}

      {current.isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 min-h-16">Loading…</p>
      ) : current.isError ? (
        <div className="flex flex-col items-start gap-2 min-h-16">
          <p className="text-sm text-red-500">Failed to load. Please try again.</p>
          <button
            type="button"
            onClick={current.refetch}
            className="min-h-11 sm:min-h-0 px-4 py-2 text-xs font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 transition"
          >
            Retry
          </button>
        </div>
      ) : current.items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 min-h-16">
          {view === "performed" && showTabs ? "You haven't changed anything yet." : "No activity yet."}
        </p>
      ) : view === "performed" && showTabs ? (
        <div className={listClass}>
          {performed.items.map((item) => (
            <div key={item.id} className={cardClass}>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{auditEventLabel(item.eventType)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 wrap-anywhere">
                {item.detail}
                {item.targetName ? ` → ${item.targetName}` : ""}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                <EntryTime entry={item} />
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className={listClass}>
          {mine.items.map((item) => (
            <div key={item.id} className={cardClass}>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{activityEventLabel(item.eventType)}</p>
              {item.detail ? (
                <p className="text-xs text-gray-500 dark:text-gray-400 wrap-anywhere">{item.detail}</p>
              ) : null}
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                <EntryTime entry={item} />
              </p>
            </div>
          ))}
        </div>
      )}

      <PagerControls
        pageIndex={current.pageIndex}
        hasPrevious={current.hasPrevious}
        hasNext={current.hasNext}
        isFetching={current.isFetching && !current.isLoading}
        onPrevious={current.goPrevious}
        onNext={current.goNext}
      />
    </ProfileSection>
  );
};

export default ProfileActivitySection;
