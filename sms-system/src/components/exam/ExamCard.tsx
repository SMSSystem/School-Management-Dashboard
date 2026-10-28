// One exam of the staff's Exams list as a card, for a phone (the table's columns, stacked): the title with its Online badge,
// the subject under a title, the class, the type, the teacher, the date and time, the status, and the actions (passed in,
// since which ones show depends on the person's role). The student's list has its own cards (StudentExamList).
export default function ExamCard({
  title,
  online,
  subject,
  className,
  typeLabel,
  teacher,
  dateText,
  status,
  statusClass,
  actions,
}: {
  title: string;
  online: boolean;
  /** The subject, shown under the title when the exam has a title of its own. */
  subject?: string;
  className: string;
  typeLabel: string;
  teacher: string;
  dateText: string;
  /** The status label, or null for an exam that is only on the timetable. */
  status: string | null;
  statusClass: string;
  actions: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-md p-3 ring-1 ring-gray-200 dark:ring-gray-700">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{title}</span>
          {online && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">Online</span>
          )}
        </div>
        {subject && <div className="text-xs text-gray-500 dark:text-gray-400">{subject}</div>}
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-300">
        {[className, typeLabel || "—"].filter(Boolean).join(" · ")}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {teacher ? `${teacher} · ` : ""}
        {dateText}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {status ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass}`}>{status}</span> : <span className="text-xs text-gray-400">—</span>}
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
    </li>
  );
}
