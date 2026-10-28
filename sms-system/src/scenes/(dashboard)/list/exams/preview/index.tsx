import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useExamPreview } from "@/hooks/useExamPreview";
import ExamPreviewScreen from "@/components/exam/take/ExamPreviewScreen";
import RouteFallback from "@/components/RouteFallback";
import { toggleAnswer, toggleFlag } from "@/lib/examTakeLogic";

// Preview as student (EXAMS_FEATURE_SPEC.md §4.7): the exam as a student sees it, one question at a time with the
// navigator, flags and the answered count, for staff with access (a spectator too). The answers and flags live only
// in this page: nothing is saved, no attempt is made, and the timer and the Submit button a student has are not here.
// The page reads the exam and holds the state; ExamPreviewScreen draws it, by window size like the student's screen.
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

  return (
    <ExamPreviewScreen
      exam={p.exam}
      questions={p.questions}
      back={back}
      current={current}
      answers={answers}
      flags={flags}
      srcOf={p.srcOf}
      onSelect={setCurrent}
      onToggleOption={(question, optionId) => setAnswers((a) => ({ ...a, [question.id]: toggleAnswer(question, a[question.id], optionId) }))}
      onToggleFlag={(questionId) => setFlags((f) => toggleFlag(f, questionId))}
      onShuffle={() => {
        p.reshuffle();
        setCurrent(0);
      }}
      onClear={() => {
        setAnswers({});
        setFlags([]);
      }}
    />
  );
};

export default ExamPreviewPage;
