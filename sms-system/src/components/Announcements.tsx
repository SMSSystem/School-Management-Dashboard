import { Link } from "react-router-dom";
import { announcementsData } from "@/lib/data";

const rowColors = [
  "bg-lamaSkyLight dark:bg-sky-900/20",
  "bg-lamaPurpleLight dark:bg-purple-900/20",
  "bg-lamaYellowLight dark:bg-yellow-900/20",
];

const Announcements = () => {
  const items = announcementsData.slice(0, 3);

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Announcements</h1>
        <Link
          to="/list/announcements"
          className="flex items-center justify-center lg:justify-start gap-4 text-gray-500 py-2 md:px-2 rounded-md hover:bg-lamaSkyLight hover:text-blue-500"
        >
          <span className="text-xs text-gray-400 dark:text-gray-300 hover:text-blue-400">View All</span>
        </Link>
      </div>
      <div className="flex flex-col gap-4 mt-4">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
            No announcements to display.
          </p>
        ) : (
          items.map((ann, i) => (
            <div key={ann.id} className={`${rowColors[i % rowColors.length]} rounded-md p-4`}>
              <div className="flex items-center justify-between">
                <h2 className="font-medium">{ann.title}</h2>
                <span className="text-xs text-gray-400 bg-white dark:bg-gray-700 rounded-md px-1 py-1">
                  {ann.date}
                </span>
              </div>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Class: {ann.class}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Announcements;
