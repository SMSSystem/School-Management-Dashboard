import ExamTimer from "./ExamTimer";
import TimesUpBanner from "./TimesUpBanner";

// The top of the attempt screen in the carousel layout: it sticks to the top of the scrolling area, so the countdown is
// always in view however far the question is scrolled. The exam's name on one line, the clock, where the student is
// ("Question 3 of 20 · 12 answered"), what is known about saving, and, at 00:00, that time is up. The background is opaque
// so the question never shows through. Below the dialogs (z-50).
export default function ExamStickyHeader({
  title,
  subtitle,
  remainingMs,
  position,
  saveText,
  saveRole,
  timeUp,
  sendingFailed,
}: {
  title: string;
  subtitle: string;
  /** The time left; leave it out (the staff preview) and there is no clock, only a Preview pill. */
  remainingMs?: number;
  /** "Question 3 of 20 · 12 answered". */
  position: string;
  /** What to say about saving, or null for nothing. */
  saveText: string | null;
  saveRole: "status" | undefined;
  timeUp: boolean;
  sendingFailed: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 flex flex-col gap-1 border-b border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between gap-3">
        <h1 title={subtitle ? `${title} · ${subtitle}` : title} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </h1>
        {remainingMs === undefined ? (
          <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-900/30 dark:text-violet-200">Preview</span>
        ) : (
          <ExamTimer remainingMs={remainingMs} compact />
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <p className="font-medium">{position}</p>
        {saveText && (
          <p role={saveRole} className="text-right text-gray-500 dark:text-gray-400">
            {saveText}
          </p>
        )}
      </div>
      {timeUp && <TimesUpBanner sendingFailed={sendingFailed} />}
    </header>
  );
}
