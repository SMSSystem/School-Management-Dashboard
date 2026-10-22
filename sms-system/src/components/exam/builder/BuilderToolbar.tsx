import { useState } from "react";
import { Save } from "lucide-react";
import { EXAM_LIMITS, type ExamStatus } from "@/types/exams";
import type { EditMode } from "@/lib/examBuilderLogic";
import type { ExamIssue } from "@/lib/examKeyValidation";
import type { ExamStatusAction } from "@/lib/teacherAudit";
import type { BuilderNotice } from "@/hooks/useExamBuilder";
import type { DayCheck } from "@/lib/examDayLoad";
import { dayBudgetMessage } from "@/lib/examDayBudget";
import { PRIMARY_BUTTON_CLS as PRIMARY, SECONDARY_BUTTON_CLS as SECONDARY } from "./builderStyles";

type StatusAction = { to: ExamStatus; action: ExamStatusAction; label: string };

const CONFIRM_TEXT: Record<ExamStatusAction, string> = {
  published: "Publish this exam? Students of the class can open it when the window opens.",
  draft: "Return this exam to a draft? Students will no longer be able to open it.",
  closed: "Close this exam now? No new attempts can start; running attempts end at their own deadline.",
  reopened: "Reopen this exam for students?",
};

// The top of the builder (EXAMS_FEATURE_SPEC.md §4.2 and §4.3): the exam's name and status, the counts, the notice
// for the current edit mode, and the Save and status buttons (the page adds its own, such as Import and Preview). A status change asks to be confirmed, and
// Publish lists what is still missing instead of failing.
export default function BuilderToolbar({
  title,
  subtitle,
  statusLabel,
  questionCount,
  totalPoints,
  mode,
  dirty,
  busy,
  notice,
  actions,
  onSave,
  onStatus,
  getBlockers,
  checkDay,
  extra,
}: {
  title: string;
  subtitle: string;
  statusLabel: string;
  questionCount: number;
  totalPoints: number;
  mode: EditMode;
  dirty: boolean;
  busy: boolean;
  notice: BuilderNotice | null;
  actions: StatusAction[];
  onSave: () => void;
  onStatus: (to: ExamStatus, action: ExamStatusAction) => void;
  getBlockers: () => ExamIssue[];
  /** The day's total of online exams against the daily budget, asked before Publish and Reopen (null: not worked out). */
  checkDay?: () => Promise<DayCheck | null>;
  /** Buttons the page adds beside Save (for example Import). */
  extra?: React.ReactNode;
}) {
  const [pending, setPending] = useState<StatusAction | null>(null);
  const [blockers, setBlockers] = useState<ExamIssue[]>([]);
  const [checking, setChecking] = useState(false);
  const [dayCheck, setDayCheck] = useState<DayCheck | null>(null);

  const choose = async (action: StatusAction) => {
    setDayCheck(null);
    if (action.action === "published") {
      const found = getBlockers();
      setBlockers(found);
      if (found.length > 0) {
        setPending(null);
        return;
      }
    } else {
      setBlockers([]);
    }
    if ((action.action === "published" || action.action === "reopened") && checkDay) {
      setChecking(true);
      try {
        setDayCheck(await checkDay());
      } finally {
        setChecking(false);
      }
    }
    setPending(action);
  };

  const modeNotice =
    mode === "key_only"
      ? "Students have seen these questions, so only the correct answers can be changed. Saving raises the key revision, and grades already given will show Re-grade needed."
      : mode === "read_only"
        ? "You can view this exam but not change it."
        : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">{statusLabel}</span>
          <span className="text-gray-600 dark:text-gray-300">
            {questionCount} of {EXAM_LIMITS.maxQuestions} questions · {totalPoints} {totalPoints === 1 ? "point" : "points"}
          </span>
        </div>
      </div>

      {modeNotice && (
        <p role="note" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          {modeNotice}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {mode !== "read_only" && (
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || busy}
            className={PRIMARY}
            style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
          >
            <Save className="h-4 w-4" aria-hidden="true" /> {busy ? "Saving…" : "Save"}
          </button>
        )}
        {extra}
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => void choose(a)}
            disabled={busy || checking || (a.action === "published" && dirty)}
            title={a.action === "published" && dirty ? "Save your changes first" : undefined}
            className={SECONDARY}
          >
            {a.label}
          </button>
        ))}
        {dirty && <span className="text-xs text-amber-700 dark:text-amber-300">Unsaved changes</span>}
      </div>

      {checking && <p role="status" className="text-sm text-gray-500 dark:text-gray-400">Checking how much the exams of that day use…</p>}

      {pending && dayCheck?.decision === "blocked" && (
        <div role="alert" aria-label="Over the daily limit" className="flex flex-col gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
          <p className="font-medium">This exam cannot be published for that day.</p>
          <p>{dayBudgetMessage(dayCheck.date, dayCheck.budget)}</p>
          <p>Move one of the exams to another day, or ask an administrator to publish it.</p>
          <div>
            <button type="button" className={SECONDARY} onClick={() => setPending(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {pending && dayCheck?.decision !== "blocked" && (
        <div role="alertdialog" aria-label="Confirm" className="flex flex-wrap items-center gap-3 rounded-md bg-sky-50 p-3 text-sm dark:bg-sky-900/20">
          <span>{CONFIRM_TEXT[pending.action]}</span>
          {dayCheck && (
            <span className={dayCheck.decision === "admin_override" ? "w-full font-medium text-amber-800 dark:text-amber-200" : "w-full text-gray-600 dark:text-gray-300"}>
              {dayBudgetMessage(dayCheck.date, dayCheck.budget)}
              {dayCheck.decision === "admin_override" ? " As an administrator you can publish it anyway." : ""}
            </span>
          )}
          <button
            type="button"
            disabled={busy}
            className={SECONDARY}
            onClick={() => {
              const chosen = pending;
              setPending(null);
              onStatus(chosen.to, chosen.action);
            }}
          >
            {dayCheck?.decision === "admin_override" ? "Yes, publish anyway" : `Yes, ${pending.label.toLowerCase()}`}
          </button>
          <button type="button" className={SECONDARY} onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      )}

      {blockers.length > 0 && (
        <div role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
          <p className="font-medium">This exam cannot be published yet:</p>
          <ul className="mt-1 list-disc pl-5">
            {blockers.map((b) => (
              <li key={`${b.code}-${b.message}`}>{b.message}</li>
            ))}
          </ul>
        </div>
      )}

      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={`rounded-md p-3 text-sm ${
            notice.kind === "error"
              ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200"
              : "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-200"
          }`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
