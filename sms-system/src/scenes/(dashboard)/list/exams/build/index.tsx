import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BarChart3, Eye, FileUp, Plus } from "lucide-react";
import { useExamBuilder } from "@/hooks/useExamBuilder";
import BuilderToolbar from "@/components/exam/builder/BuilderToolbar";
import QuestionEditor from "@/components/exam/builder/QuestionEditor";
import ExamImportDialog, { type ImportMode } from "@/components/exam/builder/ExamImportDialog";
import ImportWarningsBanner from "@/components/exam/builder/ImportWarningsBanner";
import { SECONDARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import ConfirmDialog from "@/components/ConfirmDialog";
import RouteFallback from "@/components/RouteFallback";
import { contentCounts, defaultKind, duplicateQuestion, moveQuestion, newQuestion, picturesNote, splitDraft } from "@/lib/examBuilderLogic";
import { mergeImported, type ImportResult, type ImportWarning } from "@/lib/examImport";
import type { ImportedPicture } from "@/lib/examImportReview";
import { examPhase } from "@/lib/examTiming";
import { millisOf } from "@/lib/examListLogic";
import { EXAM_LIMITS, EXAM_STATUS_LABELS } from "@/types/exams";

// The exam builder (EXAMS_FEATURE_SPEC.md §4.3): write the questions, mark the correct options, save, and publish.
// Staff with access to the exam only (a spectator sees it read only). Nothing is saved until Save is pressed.
const ExamBuilderPage = () => {
  const { examId } = useParams();
  const b = useExamBuilder(examId);
  const { exam, draft, mode, dirty } = b;
  const [importing, setImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState<ImportWarning[]>([]);
  // A question waiting to be deleted, and leaving with unsaved changes: both ask in a dialog, not the browser's pop-up.
  const [pendingDelete, setPendingDelete] = useState<{ id: string; number: number } | null>(null);
  const [leaving, setLeaving] = useState(false);
  const navigate = useNavigate();

  // Leaving or reloading with unsaved work asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (b.loading) return <RouteFallback />;

  const back = (
    <Link
      to="/dashboard/list/exams"
      onClick={(e) => {
        if (dirty) {
          e.preventDefault();
          setLeaving(true);
        }
      }}
      className="text-sm text-sky-700 hover:underline dark:text-sky-300"
    >
      ← Back to exams
    </Link>
  );

  if (b.error || !exam) {
    return (
      <div className="m-4 flex flex-1 flex-col gap-3 rounded-md bg-white p-4 dark:bg-gray-800">
        {back}
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {b.error ?? "This exam could not be found."}
        </p>
      </div>
    );
  }

  const counts = contentCounts(splitDraft(draft).questions);
  const picturesLine = picturesNote(b.packs, draft);
  const statusLabel = EXAM_STATUS_LABELS[exam.status ?? "draft"];
  const phase = examPhase(
    { status: exam.status, opensAtMs: millisOf(exam.opensAt), closesAtMs: millisOf(exam.closesAt) },
    Date.now(),
  );
  const full = mode === "full";

  // The imported questions go into the list unsaved; Save writes them like any other edit.
  const applyImport = (result: ImportResult, how: ImportMode, pictures: ImportedPicture[]) => {
    const merged = mergeImported(draft, result.questions, how);
    // A picture goes with its question; one whose question did not fit under the limit goes with it.
    const placed = pictures.flatMap(({ questionIndex, picture }) => {
      const question = result.questions[questionIndex];
      return question && merged.questions.some((q) => q.id === question.id) ? [{ questionId: question.id, picture }] : [];
    });
    b.applyImported(merged.questions, placed);
    const warnings = [...result.warnings];
    if (merged.dropped > 0) {
      warnings.push({ message: `${merged.dropped} question${merged.dropped === 1 ? " was" : "s were"} left out to stay within ${EXAM_LIMITS.maxQuestions} questions.` });
    }
    setImportWarnings(warnings);
    setImporting(false);
    b.setNotice({
      kind: "ok",
      text: `${result.questions.length - merged.dropped} question${result.questions.length - merged.dropped === 1 ? "" : "s"} imported${placed.length > 0 ? ` with ${placed.length} picture${placed.length === 1 ? "" : "s"}` : ""}. Check them, then press Save.`,
    });
  };

  return (
    <div className="m-4 flex flex-1 flex-col gap-4 rounded-md bg-white p-4 dark:bg-gray-800">
      {back}
      <BuilderToolbar
        title={exam.title || "Untitled exam"}
        subtitle={[exam.className, exam.subjectName].filter(Boolean).join(" · ")}
        statusLabel={phase === "closed" && exam.status === "published" ? "Closed (window ended)" : statusLabel}
        questionCount={counts.questionCount}
        totalPoints={counts.totalPoints}
        mode={mode}
        dirty={dirty}
        busy={b.busy}
        progress={b.progress}
        notice={b.notice}
        actions={b.availableActions()}
        onSave={() => void b.save()}
        onStatus={(to, action) => void b.changeStatus(to, action)}
        getBlockers={b.blockers}
        checkDay={b.checkDay}
        extra={
          <>
            {full && (
              <button type="button" onClick={() => setImporting(true)} className={SECONDARY_BUTTON_CLS}>
                <FileUp className="h-4 w-4" aria-hidden="true" /> Import from file
              </button>
            )}
            <Link to={`/dashboard/list/exams/${exam.id}/preview`} className={SECONDARY_BUTTON_CLS}>
              <Eye className="h-4 w-4" aria-hidden="true" /> Preview as student
            </Link>
            {exam.status !== undefined && exam.status !== "draft" && (
              <Link to={`/dashboard/list/exams/${exam.id}/results`} className={SECONDARY_BUTTON_CLS}>
                <BarChart3 className="h-4 w-4" aria-hidden="true" /> Results
              </Link>
            )}
          </>
        }
      />

      {picturesLine && <p className="text-xs text-gray-500 dark:text-gray-400">{picturesLine}</p>}

      <ImportWarningsBanner warnings={importWarnings} onDismiss={() => setImportWarnings([])} />

      {b.generalIssues.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-amber-700 dark:text-amber-300" aria-label="To fix before publishing">
          {b.generalIssues.map((issue) => (
            <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-4">
        {draft.map((question, index) => (
          <QuestionEditor
            key={question.id}
            question={question}
            index={index}
            total={draft.length}
            answerMode={exam.answerMode}
            mode={mode}
            issues={b.issuesByQuestion[question.id] ?? []}
            imageSrc={question.image ? b.packs[question.image.pack]?.images[question.image.id]?.data : undefined}
            onPicture={(picture) => b.setPicture(question.id, picture)}
            onRemovePicture={() => b.clearPicture(question.id)}
            onPictureAlt={(alt, decorative) => b.setAlt(question.id, alt, decorative)}
            onChange={(next) => b.setDraft((list) => list.map((q) => (q.id === next.id ? next : q)))}
            onMove={(delta) => b.setDraft((list) => moveQuestion(list, index, delta))}
            onDuplicate={() => b.setDraft((list) => duplicateQuestion(list, index))}
            onDelete={() => setPendingDelete({ id: question.id, number: index + 1 })}
          />
        ))}
        {draft.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {full ? "There are no questions yet. Add one below." : "There are no questions in this exam."}
          </p>
        )}
      </div>

      {full && (
        <button
          type="button"
          disabled={draft.length >= EXAM_LIMITS.maxQuestions}
          onClick={() => b.setDraft((list) => [...list, newQuestion(defaultKind(exam.answerMode))])}
          className="flex w-fit items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-sky-700 ring-1 ring-sky-300 hover:bg-sky-50 disabled:opacity-50 dark:text-sky-300 dark:ring-sky-700 dark:hover:bg-sky-900/20"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add question
        </button>
      )}
      {importing && (
        <ExamImportDialog
          answerMode={exam.answerMode}
          existingCount={draft.length}
          onApply={applyImport}
          onClose={() => setImporting(false)}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={`Delete question ${pendingDelete.number}?`}
          message="The question, its options and its answer key are removed from the list. Nothing is saved until you press Save, so leaving the page without saving brings the question back."
          confirmLabel="Delete question"
          tone="danger"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            b.setDraft((list) => list.filter((q) => q.id !== pendingDelete.id));
            setPendingDelete(null);
          }}
        />
      )}
      {leaving && (
        <ConfirmDialog
          title="Leave without saving?"
          message="You have unsaved changes to this exam. If you leave now they are lost."
          confirmLabel="Leave without saving"
          tone="danger"
          onCancel={() => setLeaving(false)}
          onConfirm={() => navigate("/dashboard/list/exams")}
        />
      )}
    </div>
  );
};

export default ExamBuilderPage;
