import { Link } from "react-router-dom";
import type { scoreView } from "@/lib/examStudentLogic";

export type FinishedKind = "submitted" | "timeout" | "late" | "missed" | "closed";

// The outcomes that come from the clock running out; each says so in a heading while no score is released.
const TIME_BASED: readonly FinishedKind[] = ["timeout", "late", "missed"];

const MESSAGES: Record<FinishedKind, string> = {
  submitted: "Submitted. Your result will be shown here when your teacher releases it.",
  timeout: "Your answers were submitted. Your result will be shown here when your teacher releases it.",
  late: "Your time ran out before your answers could be sent. The answers saved at your last save are kept. Tell your teacher.",
  missed: "Your time for this exam has ended. The answers saved before then are kept, and your teacher will mark the exam.",
  closed: "This exam has closed, and you did not start it.",
};

// After the attempt (EXAMS_FEATURE_SPEC.md §4.5): what happened, and once a score has been released the score, the
// percentage and the teacher's comment. Never the questions, the answers or the key.
export default function ExamFinishedScreen({
  kind,
  title,
  subtitle,
  score,
}: {
  kind: FinishedKind;
  title: string;
  subtitle: string;
  score: ReturnType<typeof scoreView>;
}) {
  return (
    <div className="m-4 flex max-w-2xl flex-col gap-4 rounded-md bg-white p-5 dark:bg-gray-800">
      <Link to="/dashboard/list/exams" className="text-sm text-sky-700 hover:underline dark:text-sky-300">
        ← Back to exams
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
      {score ? (
        <div role="status" className="flex flex-col gap-1 rounded-md bg-green-50 p-4 dark:bg-green-900/20">
          <p className="text-sm text-green-800 dark:text-green-200">Your score</p>
          <p className="text-2xl font-semibold text-green-900 dark:text-green-100">
            {score.text}
            {score.percent !== null && <span className="ml-2 text-lg font-normal">({score.percent}%)</span>}
          </p>
          {score.comment && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-green-900 dark:text-green-100">{score.comment}</p>}
        </div>
      ) : (
        <p role="status" className="rounded-md bg-sky-50 p-4 text-sm text-sky-900 dark:bg-sky-900/20 dark:text-sky-100">
          {TIME_BASED.includes(kind) && <span className="block text-lg font-semibold">Time&apos;s up!</span>}
          {MESSAGES[kind]}
        </p>
      )}
    </div>
  );
}
