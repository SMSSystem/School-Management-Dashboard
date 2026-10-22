import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useExamPreview } from "@/hooks/useExamPreview";
import QuestionNavigator from "@/components/exam/take/QuestionNavigator";
import StudentQuestionView from "@/components/exam/take/StudentQuestionView";
import RouteFallback from "@/components/RouteFallback";
import { SECONDARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import { answeredCount, navigatorState, toggleAnswer, toggleFlag } from "@/lib/examTakeLogic";
import { millisOf } from "@/lib/examListLogic";

import { formatExamWindow, jamaicaTimeNote } from "@/lib/examDateTime";

// Preview as student (EXAMS_FEATURE_SPEC.md §4.7): the exam as a student sees it, one question at a time with the
// navigator, flags and the answered count, for staff with access (a spectator too). The answers and flags live only
// in this page: nothing is saved, no attempt is made, and the timer and the Submit button a student has are not here.
const ExamPreviewPage = () => {
  const { examId } = useParams();
  const p = useExamPreview(examId);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [flags, setFlags] = useState<string[]>([]);

  if (p.loading) return <RouteFallback />;

  const back = (
    <Link
      to={p.exam && p.canManage ? `/dashboard/list/exams/${p.exam.id}/build` : "/dashboard/list/exams"}
      className="text-sm text-sky-700 hover:underline dark:text-sky-300"
    >
      ← {p.exam && p.canManage ? "Back to the builder" : "Back to exams"}
    </Link>
  );

  if (p.error || !p.exam) {
    return (
      <div className="m-4 flex flex-1 flex-col gap-3 rounded-md bg-white p-4 dark:bg-gray-800">
        {back}
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {p.error ?? "This exam could not be found."}
        </p>
      </div>
    );
  }

  const { exam, questions } = p;
  const index = Math.min(current, Math.max(questions.length - 1, 0));
  const question = questions[index];
  const items = navigatorState(questions, answers, flags);

  return (
    <div className="m-4 flex flex-1 flex-col gap-4 rounded-md bg-white p-4 dark:bg-gray-800">
      {back}
      <p role="note" className="rounded-md bg-violet-50 p-3 text-sm font-medium text-violet-800 dark:bg-violet-900/20 dark:text-violet-200">
        Preview — nothing is saved. This is how a student sees the exam. A student also has a countdown timer and a Submit
        button here.
      </p>

      <div>
        <h1 className="text-lg font-semibold">{exam.title || "Untitled exam"}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {[exam.className, exam.subjectName].filter(Boolean).join(" · ")}
          {exam.duration ? ` · ${exam.duration} minutes` : ""} · {formatExamWindow(millisOf(exam.opensAt), millisOf(exam.closesAt))}
        </p>
        {jamaicaTimeNote() && <p className="text-xs text-gray-500 dark:text-gray-400">{jamaicaTimeNote()}</p>}
      </div>

      {questions.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">This exam has no questions yet. Add some in the builder.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium" aria-live="polite">
              Answered {answeredCount(questions, answers)} of {questions.length}
            </p>
            <div className="flex gap-2">
              {exam.shuffle !== false && (
                <button type="button" className={SECONDARY_BUTTON_CLS} onClick={() => { p.reshuffle(); setCurrent(0); }}>
                  Shuffle again
                </button>
              )}
              <button
                type="button"
                className={SECONDARY_BUTTON_CLS}
                onClick={() => {
                  setAnswers({});
                  setFlags([]);
                }}
              >
                Clear my answers
              </button>
            </div>
          </div>

          <QuestionNavigator items={items} currentId={question?.id} onSelect={(id) => setCurrent(questions.findIndex((q) => q.id === id))} />

          {question && (
            <StudentQuestionView
              question={question}
              number={index + 1}
              total={questions.length}
              chosen={answers[question.id] ?? []}
              flagged={flags.includes(question.id)}
              onToggleOption={(optionId) => setAnswers((a) => ({ ...a, [question.id]: toggleAnswer(question, a[question.id], optionId) }))}
              onToggleFlag={() => setFlags((f) => toggleFlag(f, question.id))}
            />
          )}

          <div className="flex justify-between">
            <button type="button" className={SECONDARY_BUTTON_CLS} disabled={index === 0} onClick={() => setCurrent(index - 1)}>
              Previous
            </button>
            <button type="button" className={SECONDARY_BUTTON_CLS} disabled={index >= questions.length - 1} onClick={() => setCurrent(index + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ExamPreviewPage;
