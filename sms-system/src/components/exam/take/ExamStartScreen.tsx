import { Link } from "react-router-dom";
import { useMediaQuery, MOBILE_QUERY } from "@/hooks/useMediaQuery";
import { PRIMARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import { formatExamDateTime as when, jamaicaTimeNote } from "@/lib/examDateTime";

// Said to every student before they start: what the exam records (docs/miscellaneous-specs/EXAM_IMAGES_AND_INTEGRITY_SPEC.md §9.7).
export const ACTIVITY_NOTICE =
  "This exam records when you leave this page (by switching to another tab or window) and when you copy or print. Your teacher can see it.";

// Before the attempt (EXAMS_FEATURE_SPEC.md §4.5): what the exam is, how long the student has, the rules, and Start.
// The phone notice is information only and never stops the attempt.
export default function ExamStartScreen({
  title,
  subtitle,
  questionCount,
  durationMinutes,
  extraMinutes,
  checkpointMinutes,
  opensAtMs,
  closesAtMs,
  opensYet,
  lateNote,
  starting,
  error,
  unsupervised = false,
  onStart,
}: {
  title: string;
  subtitle: string;
  questionCount: number;
  durationMinutes: number;
  extraMinutes: number;
  checkpointMinutes: number;
  opensAtMs: number;
  closesAtMs: number;
  /** The window has opened by the server's clock. */
  opensYet: boolean;
  lateNote: string | null;
  starting: boolean;
  error: string | null;
  /** An unsupervised exam: Start asks for fullscreen and the student's name is shown faintly over the questions. */
  unsupervised?: boolean;
  onStart: () => void;
}) {
  const phone = useMediaQuery(MOBILE_QUERY);
  return (
    <div className="m-4 flex max-w-2xl flex-col gap-4 rounded-md bg-white p-5 dark:bg-gray-800">
      <Link to="/dashboard/list/exams" className="text-sm text-sky-700 hover:underline dark:text-sky-300">
        ← Back to exams
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-gray-500 dark:text-gray-400">Questions</dt>
        <dd>{questionCount}</dd>
        <dt className="text-gray-500 dark:text-gray-400">Time allowed</dt>
        <dd>
          {durationMinutes} minutes
          {extraMinutes > 0 && ` + ${extraMinutes} minutes extra time given to you`}
        </dd>
        <dt className="text-gray-500 dark:text-gray-400">Opens</dt>
        <dd>{when(opensAtMs)}</dd>
        <dt className="text-gray-500 dark:text-gray-400">Closes</dt>
        <dd>{when(closesAtMs)}</dd>
      </dl>
      {jamaicaTimeNote() && <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">{jamaicaTimeNote()}</p>}

      {lateNote && (
        <p role="note" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          {lateNote}
        </p>
      )}

      <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
        <li>You can attempt this exam once. The timer cannot be paused.</li>
        <li>Your answers are saved about every {checkpointMinutes} minutes and when you submit. If the page closes, come back and press Resume.</li>
        <li>Copying, the right-click menu, dragging and printing the questions are switched off, and each attempt is recorded. Leaving the page is only recorded: nothing stops you.</li>
        <li>When the time is up your answers are submitted for you.</li>
        {unsupervised && (
          <li>
            This exam is unsupervised. Pressing Start asks your browser for fullscreen; leaving fullscreen is recorded, and a button lets
            you go back. Your name and a short code are shown faintly over the questions.
          </li>
        )}
      </ul>

      <p role="note" className="rounded-md bg-gray-50 p-3 text-sm text-gray-700 dark:bg-gray-700/40 dark:text-gray-200">
        {ACTIVITY_NOTICE}
      </p>

      {phone && (
        <p role="note" className="rounded-md bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-900/20 dark:text-sky-200">
          A larger screen is easier to use for an exam. You can still continue on this one.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {opensYet ? (
        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className={`${PRIMARY_BUTTON_CLS} w-fit`}
          style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        >
          {starting ? "Starting…" : "Start exam"}
        </button>
      ) : (
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">This exam has not opened yet. Come back at {when(opensAtMs)}.</p>
      )}
    </div>
  );
}
