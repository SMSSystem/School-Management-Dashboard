import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";

const ParentPage = () => {
  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      {/* SCHEDULE — full width */}
      <div className="col-span-12">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md h-[stretch] min-h-min">
          <h1 className="text-xl font-semibold">Schedule</h1>
          <BigCalendar />
        </div>
      </div>

      {/* ANNOUNCEMENTS — full width */}
      <div className="col-span-12">
        <Announcements />
      </div>
    </div>
  );
};

export default ParentPage;
