import { Link } from "react-router-dom";
import { eventsData } from "@/lib/data";

const EventsList = () => {
  const items = eventsData.slice(0, 3);
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold my-4">Events</h1>
        <Link to="/dashboard/list/events">
          <img
            src="/moreDark.png"
            alt=""
            width={20}
            height={20}
            className="hover:grayscale hover:brightness-50 hover:scale-105 transition-all invert-0 dark:invert"
          />
        </Link>
      </div>
      <div className="flex flex-col gap-4">
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">
            No upcoming events.
          </p>
        ) : (
          items.map((event) => (
            <div
              key={event.id}
              className="p-5 rounded-md border-2 border-gray-100 dark:border-gray-700 border-t-4 odd:border-t-lamaSky even:border-t-lamaPurple"
            >
              <div className="flex items-center justify-between">
                <h1 className="font-semibold text-gray-600 dark:text-gray-200">{event.title}</h1>
                <span className="text-gray-400 dark:text-gray-500 text-xs">
                  {event.startTime} – {event.endTime}
                </span>
              </div>
              <p className="mt-2 text-gray-400 dark:text-gray-500 text-sm">
                {event.date} · {event.class}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EventsList;
