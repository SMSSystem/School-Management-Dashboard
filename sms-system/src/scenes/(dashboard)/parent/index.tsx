import { useState } from "react";
import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import MiniCalendar from "@/components/MiniCalendar";
import { ParentQuickActions } from "@/components/StudentParentQuickActions";
import CardErrorBoundary from "@/components/CardErrorBoundary";
import { useClassDays } from "@/hooks/useClassDays";
import { useLinkedChildren } from "@/hooks/useLinkedChildren";

const ParentPage = () => {
  // The page owns the child selection so the weekly calendar and the mini
  // calendar always show the same child (BigCalendar skips its own picker and
  // children load when it is given one). Children come from one cached load.
  const { children, loading: childrenLoading } = useLinkedChildren();
  const [childId, setChildId] = useState("");
  const selectedChild = children.find((c) => c.uid === childId) ?? children[0] ?? null;
  const hasClass = useClassDays(selectedChild);

  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      {/* CHILD PICKER — only when there is more than one child */}
      {!childrenLoading && children.length > 1 && (
        <div className="col-span-12 flex flex-wrap items-center gap-2" role="group" aria-label="Child">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Showing</span>
          {children.map((child) => (
            <button
              key={child.uid}
              type="button"
              aria-pressed={selectedChild?.uid === child.uid}
              onClick={() => setChildId(child.uid)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedChild?.uid === child.uid
                  ? "bg-lamaSky text-sky-900"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              {child.name}
            </button>
          ))}
        </div>
      )}

      {/* SCHEDULE — full width */}
      <div className="col-span-12">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md h-[stretch] min-h-min">
          <h1 className="text-xl font-semibold">Schedule</h1>
          {/* null (not undefined) while children load, so BigCalendar never starts its own load */}
          <CardErrorBoundary>
            <BigCalendar controlledChild={selectedChild} />
          </CardErrorBoundary>
        </div>
      </div>

      {/* MINI CALENDAR — class days for the selected child */}
      <div className="col-span-12 lg:col-span-5">
        <CardErrorBoundary>
          <MiniCalendar hasClass={hasClass} />
        </CardErrorBoundary>
      </div>

      {/* QUICK ACTIONS */}
      <div className="col-span-12 lg:col-span-7">
        <CardErrorBoundary>
          <ParentQuickActions />
        </CardErrorBoundary>
      </div>

      {/* ANNOUNCEMENTS — full width */}
      <div className="col-span-12">
        <CardErrorBoundary>
          <Announcements />
        </CardErrorBoundary>
      </div>
    </div>
  );
};

export default ParentPage;
