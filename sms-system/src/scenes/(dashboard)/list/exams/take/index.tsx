import { Link, useParams } from "react-router-dom";
import { useExamAttempt, type StartInfo } from "@/hooks/useExamAttempt";
import { useRunningAttempt, type RunningSession } from "@/hooks/useRunningAttempt";
import { useExamPictures } from "@/hooks/useExamPictures";
import { useAuth } from "@/lib/AuthContext";
import { enterFullscreen, watermarkText, type FullscreenElement } from "@/lib/examFullscreen";
import { isForwardOnly } from "@/lib/examTakeLogic";
import ExamAttemptScreen from "@/components/exam/take/ExamAttemptScreen";
import ExamFinishedScreen, { type FinishedKind } from "@/components/exam/take/ExamFinishedScreen";
import ExamStartScreen from "@/components/exam/take/ExamStartScreen";
import SubmitDialog from "@/components/exam/take/SubmitDialog";
import RouteFallback from "@/components/RouteFallback";
import { millisOf } from "@/lib/examListLogic";
import type { ExamDocument } from "@/types/exams";

const subtitleOf = (exam: ExamDocument) => [exam.subjectName, exam.className].filter(Boolean).join(" · ");

function RunningAttempt({ session, onFinish }: { session: RunningSession; onFinish: (kind: FinishedKind) => void }) {
  const run = useRunningAttempt(session, onFinish);
  const { exam } = session;
  const { institutionId, user, displayName } = useAuth();
  const unsupervised = exam.integrity === "unsupervised";
  // The pictures come after the questions, in the background; the one being looked at is read first.
  const pictures = useExamPictures({ institutionId, examId: exam.id, questions: session.questions, current: run.current });
  // Active for the whole exam, its extra time and ten minutes more.
  const capMs = ((exam.duration ?? 0) + session.extraMinutes + 10) * 60_000;
  return (
    <>
      <ExamAttemptScreen
        title={exam.title || exam.subjectName}
        subtitle={subtitleOf(exam)}
        remainingMs={run.remaining}
        questions={session.questions}
        answers={run.answers}
        flags={run.flags}
        current={run.current}
        saveStatus={run.saveStatus}
        keepAliveCapMs={capMs}
        error={run.confirming ? null : run.error}
        pictures={pictures}
        unsupervised={unsupervised}
        watermark={watermarkText(displayName, user?.uid)}
        forwardOnly={run.forwardOnly}
        onSelect={run.select}
        onToggleOption={run.toggleOption}
        onToggleFlag={run.toggleFlag}
        onSubmit={run.askToSubmit}
      />
      {run.confirming && (
        <SubmitDialog
          total={run.summary.total}
          unanswered={run.summary.unanswered}
          flagged={run.summary.flagged}
          submitting={run.submitting}
          error={run.error}
          onConfirm={run.confirmSubmit}
          onCancel={run.cancelSubmit}
        />
      )}
    </>
  );
}

function StartScreen({ info, starting, error, onStart }: { info: StartInfo; starting: boolean; error: string | null; onStart: () => void }) {
  const { exam } = info;
  const opensAtMs = millisOf(exam.opensAt) ?? 0;
  return (
    <ExamStartScreen
      title={exam.title || exam.subjectName}
      subtitle={subtitleOf(exam)}
      questionCount={exam.questionCount ?? 0}
      durationMinutes={exam.duration ?? 0}
      extraMinutes={info.extraMinutes}
      checkpointMinutes={exam.checkpointMinutes ?? 10}
      opensAtMs={opensAtMs}
      closesAtMs={millisOf(exam.closesAt) ?? 0}
      opensYet={info.serverNowMs >= opensAtMs}
      lateNote={info.lateNote}
      starting={starting}
      error={error}
      unsupervised={exam.integrity === "unsupervised"}
      forwardOnly={isForwardOnly(exam)}
      onStart={() => {
        // A browser allows fullscreen only from a click, so it is asked for here, before the attempt is made. If it is refused
        // or not offered the exam starts anyway.
        if (exam.integrity === "unsupervised") void enterFullscreen(document.documentElement as unknown as FullscreenElement);
        onStart();
      }}
    />
  );
}

// Take an exam (EXAMS_FEATURE_SPEC.md §4.5), for a student of the class: the start screen, the attempt, then what
// happened. The route sends everyone else back to the dashboard.
const ExamTakePage = () => {
  const { examId } = useParams();
  const attempt = useExamAttempt(examId);
  const { view } = attempt;

  if (view.phase === "loading") return <RouteFallback />;
  if (view.phase === "blocked") {
    return (
      <div className="m-4 flex max-w-2xl flex-col gap-3 rounded-md bg-white p-5 dark:bg-gray-800">
        <Link to="/dashboard/list/exams" className="text-sm text-sky-700 hover:underline dark:text-sky-300">
          ← Back to exams
        </Link>
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {view.message}
        </p>
      </div>
    );
  }
  if (view.phase === "start") {
    return <StartScreen info={view.info} starting={attempt.starting} error={attempt.startError} onStart={() => void attempt.begin()} />;
  }
  if (view.phase === "running") {
    return <RunningAttempt key={view.session.exam.id} session={view.session} onFinish={attempt.finish} />;
  }
  return <ExamFinishedScreen kind={view.kind} title={view.exam.title || view.exam.subjectName} subtitle={subtitleOf(view.exam)} score={view.score} />;
};

export default ExamTakePage;
