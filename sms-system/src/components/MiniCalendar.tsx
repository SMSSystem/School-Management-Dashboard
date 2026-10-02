import { useState } from "react";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";

type ValuePiece = Date | null;
type Value = ValuePiece | [ValuePiece, ValuePiece];

// `hasClass` is optional: when given (student and parent dashboards), dates with
// a lesson get a subtle dot and tint (styles in index.css, `.has-class`) and a
// short legend appears under the calendar. Without it (the teacher dashboard)
// the calendar is unchanged.
const MiniCalendar = ({ hasClass }: { hasClass?: (date: Date) => boolean }) => {
  const [value, onChange] = useState<Value>(new Date());
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-md h-full">
      <Calendar
        onChange={onChange}
        value={value}
        tileClassName={
          hasClass
            ? ({ date, view }) => (view === "month" && hasClass(date) ? "has-class" : null)
            : undefined
        }
        tileContent={
          hasClass
            ? ({ date, view }) =>
                view === "month" && hasClass(date) ? <span className="sr-only">, has class</span> : null
            : undefined
        }
      />
      {hasClass && (
        <p className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
          />
          Class day
        </p>
      )}
    </div>
  );
};

export default MiniCalendar;
