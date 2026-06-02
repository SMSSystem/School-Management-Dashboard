import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";
import EventCalendar from "@/components/EventCalendar";
import SeniorTeacherKPIs from "@/components/SeniorTeacherKPIs";
import SeniorTeacherQuickActions from "@/components/SeniorTeacherQuickActions";

const SeniorTeacherPage = () => {
  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      {/* TOP: DEPARTMENT KPI STRIP */}
      <SeniorTeacherKPIs />

      {/* MIDDLE: SCHEDULE + EVENT CALENDAR */}
      <div className="col-span-12 lg:col-span-8">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md h-[stretch] min-h-min">
          <h1 className="text-xl font-semibold">Schedule</h1>
          <BigCalendar />
        </div>
      </div>
      <div className="col-span-12 lg:col-span-4">
        <EventCalendar />
      </div>

      {/* BOTTOM: QUICK ACTIONS + ANNOUNCEMENTS */}
      <div className="col-span-12 lg:col-span-8">
        <SeniorTeacherQuickActions />
      </div>
      <div className="col-span-12 lg:col-span-4">
        <Announcements />
      </div>
    </div>
  );
};

export default SeniorTeacherPage;
