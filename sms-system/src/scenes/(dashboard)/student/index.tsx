import MiniCalendar from "@/components/MiniCalendar";
import NextClassCard from "@/components/NextClassCard";
import { StudentQuickActions } from "@/components/StudentParentQuickActions";

// Events and Announcements are intentionally not shown to students for now (they
// are not functional yet), and the weekly schedule is a single next-class card —
// a full calendar doesn't fit a phone.
const StudentPage = () => {
  return (
    <div className="p-3 sm:p-4 grid grid-cols-12 gap-3 sm:gap-4">
      {/* NEXT CLASS — full width */}
      <div className="col-span-12">
        <NextClassCard />
      </div>

      {/* QUICK ACTIONS */}
      <div className="col-span-12 lg:col-span-7 lg:order-2">
        <StudentQuickActions />
      </div>

      {/* MINI CALENDAR */}
      <div className="col-span-12 lg:col-span-5 lg:order-1">
        <MiniCalendar />
      </div>
    </div>
  );
};

export default StudentPage;
