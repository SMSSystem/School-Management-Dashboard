import Announcements from "@/components/Announcements";
import BigCalendar from "@/components/BigCalender";

const ParentPage = () => {
  return (
    <div className="p-4 grid grid-cols-12 gap-4">
      {/* MAIN: Schedule */}
      <div className="col-span-12 lg:col-span-8">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-md h-[stretch] min-h-min">
          <h1 className="text-xl font-semibold">Schedule (John Doe)</h1>
          <BigCalendar />
        </div>
      </div>
      {/* RIGHT RAIL */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
        <Announcements />
      </div>
    </div>
  );
};

export default ParentPage;
