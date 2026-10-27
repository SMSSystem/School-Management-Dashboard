import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BarChart3, Eye, FileUp } from "lucide-react";
import { useExamBuilder } from "@/hooks/useExamBuilder";
import { useNavigationGuard } from "@/hooks/useNavigationGuard";
import BuilderToolbar from "@/components/exam/builder/BuilderToolbar";
import QuestionEditor from "@/components/exam/builder/QuestionEditor";
import BuilderStrip from "@/components/exam/builder/BuilderStrip";
import BuilderRail from "@/components/exam/builder/BuilderRail";
import BuilderSheet from "@/components/exam/builder/BuilderSheet";
import BuilderMoreMenu from "@/components/exam/builder/BuilderMoreMenu";
import { MOBILE_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import ExamImportDialog, { type ImportMode } from "@/components/exam/builder/ExamImportDialog";
import ImportWarningsBanner from "@/components/exam/builder/ImportWarningsBanner";
import { SECONDARY_BUTTON_CLS } from "@/components/exam/builder/builderStyles";
import ConfirmDialog from "@/components/ConfirmDialog";
import RouteFallback from "@/components/RouteFallback";
import { contentCounts, defaultKind, duplicateQuestion, moveQuestion, newQuestion, picturesNote, splitDraft } from "@/lib/examBuilderLogic";
import { mergeImported, type ImportResult, type ImportWarning } from "@/lib/examImport";
import { picturesForMerged, type ImportedPicture } from "@/lib/examImportReview";
import { activeIndex, firstNewId, idAfterDelete, stepId } from "@/lib/examBuilderNav";
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
  // A question waiting to be deleted asks in a dialog, not the browser's pop-up.
  const [pendingDelete, setPendingDelete] = useState<{ id: string; number: number } | null>(null);
  // The question being edited, by id (so moving it keeps it chosen); the first one until another is chosen.
  const [activeId, setActiveId] = useState<string | null>(null);
  // The list of questions: shown beside the editor from md up (the rail) and as a sheet below it; both can show only the
  // questions that have something to fix.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const phone = useMediaQuery(MOBILE_QUERY);

  // Leaving with unsaved work asks first: a link (Preview as student, Back, the sidebar), the back button, Sign out,
  // Start Tour and closing the tab (components/NavigationGuardProvider.tsx).
  useNavigationGuard(dirty);

  if (b.loading) return <RouteFallback />;

  const back = (
    <Link to="/dashboard/list/exams" className="text-sm text-sky-700 hover:underline dark:text-sky-300">
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
  const at = activeIndex(draft, activeId);
  const question = draft[at];

  const attention = draft.filter((q) => (b.issuesByQuestion[q.id]?.length ?? 0) > 0).length;
  const listProps = {
    questions: draft,
    activeId: question?.id,
    issuesByQuestion: b.issuesByQuestion,
    onlyIssues,
    onToggleIssues: () => setOnlyIssues((v) => !v),
    onSelect: setActiveId,
    onAdd: full ? () => addQuestion() : undefined,
  };

  // "N questions need attention": show only those, as a sheet on a phone and in the rail with the first one open elsewhere.
  const showAttention = () => {
    setOnlyIssues(true);
    if (phone) setSheetOpen(true);
    else setActiveId(draft.find((q) => (b.issuesByQuestion[q.id]?.length ?? 0) > 0)?.id ?? activeId);
  };

  const addQuestion = () => {
    const added = newQuestion(defaultKind(exam.answerMode));
    b.setDraft((list) => [...list, added]);
    setActiveId(added.id);
  };

  // The imported questions go into the list unsaved; Save writes them like any other edit.
  const applyImport = (result: ImportResult, how: ImportMode, pictures: ImportedPicture[]) => {
    const merged = mergeImported(draft, result.questions, how);
    // A picture goes with its question; one whose question did not fit under the limit goes with it.
    const placed = picturesForMerged(result.questions, merged.questions, pictures);
    b.applyImported(merged.questions, placed);
    // The first question the file brought is the one to look at.
    setActiveId(firstNewId(draft, merged.questions) ?? activeId);
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
    <div data-exam-builder className="m-4 flex flex-1 flex-col gap-4 rounded-md bg-white p-4 dark:bg-gray-800">
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
        attention={attention}
        onShowAttention={showAttention}
        phoneExtra={
          <BuilderMoreMenu
            items={[
              ...(full ? [{ label: "Import from file", icon: <FileUp className="h-4 w-4" aria-hidden="true" />, onClick: () => setImporting(true) }] : []),
              { label: "Preview as student", icon: <Eye className="h-4 w-4" aria-hidden="true" />, to: `/dashboard/list/exams/${exam.id}/preview` },
              ...(exam.status !== undefined && exam.status !== "draft"
                ? [{ label: "Results", icon: <BarChart3 className="h-4 w-4" aria-hidden="true" />, to: `/dashboard/list/exams/${exam.id}/results` }]
                : []),
            ]}
          />
        }
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

      <div className="md:grid md:grid-cols-[16rem_minmax(0,1fr)] md:items-start md:gap-4">
      <BuilderRail
        {...listProps}
        onMove={full ? (index, delta) => {
          const moved = draft[index];
          b.setDraft((list) => moveQuestion(list, index, delta));
          if (moved) setActiveId(moved.id);
        } : undefined}
      />

      <div className="flex min-w-0 flex-col gap-4">
      <BuilderStrip
        index={at}
        total={draft.length}
        canAdd={full}
        onPrevious={() => setActiveId(stepId(draft, activeId, -1))}
        onNext={() => setActiveId(stepId(draft, activeId, 1))}
        onAdd={addQuestion}
        trailing={
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={attention > 0 ? `Questions, ${attention} need attention` : `Questions, ${draft.length}`}
            className={`${SECONDARY_BUTTON_CLS} min-h-11 md:hidden`}
          >
            Questions
            {attention > 0 && (
              <span aria-hidden="true" className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                {attention}
              </span>
            )}
          </button>
        }
      />

      <div className="flex flex-col gap-4">
        {question && (
          <QuestionEditor
            key={question.id}
            question={question}
            index={at}
            total={draft.length}
            answerMode={exam.answerMode}
            mode={mode}
            issues={b.issuesByQuestion[question.id] ?? []}
            imageSrc={question.image ? b.packs[question.image.pack]?.images[question.image.id]?.data : undefined}
            onPicture={(picture) => b.setPicture(question.id, picture)}
            onRemovePicture={() => b.clearPicture(question.id)}
            onPictureAlt={(alt, decorative) => b.setAlt(question.id, alt, decorative)}
            onChange={(next) => b.setDraft((list) => list.map((q) => (q.id === next.id ? next : q)))}
            onMove={(delta) => {
              b.setDraft((list) => moveQuestion(list, at, delta));
              setActiveId(question.id);
            }}
            onDuplicate={() => {
              const after = duplicateQuestion(draft, at);
              b.setDraft(after);
              setActiveId(firstNewId(draft, after) ?? question.id);
            }}
            onDelete={() => setPendingDelete({ id: question.id, number: at + 1 })}
          />
        )}
        {draft.length === 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {full ? "There are no questions yet. Add one with Add question above." : "There are no questions in this exam."}
          </p>
        )}
      </div>
      </div>
      </div>
      {sheetOpen && (
        <BuilderSheet
          {...listProps}
          onAdd={full ? () => {
            addQuestion();
            setSheetOpen(false);
          } : undefined}
          onClose={() => setSheetOpen(false)}
        />
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
            setActiveId(idAfterDelete(draft, pendingDelete.id));
            b.setDraft((list) => list.filter((q) => q.id !== pendingDelete.id));
            setPendingDelete(null);
          }}
        />
      )}
    </div>
  );
};

export default ExamBuilderPage;
