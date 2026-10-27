import type { ChangeEvent } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { Info } from "lucide-react";
import InputField from "../../InputField";
import FormSection from "./FormSection";
import { FULL_ROW_CLS, ROOMY_FIELD_CLS, ROOMY_INPUT_CLS, ROOMY_LABEL_CLS } from "./examFormStyles";
import type { ExamFormValues } from "./examFormSchema";
import { EXAM_DAILY_WRITE_BUDGET, type ExamBudget } from "@/lib/examBudget";
import {
  EXAM_INTEGRITY_OPTION_TEXT,
  EXAM_INTEGRITY_PRESETS,
  EXAM_LIMITS,
  EXAM_RELEASE_MODES,
  EXAM_RELEASE_MODE_LABELS,
  EXAM_SCORING_MODES,
  EXAM_SCORING_MODE_LABELS,
} from "@/types/exams";

const CHECKPOINT_CHOICES = [5, 10, 15] as const;
const CHECK_ROW_CLS = "flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer";

// The note under the online settings: what one sitting of the class costs against the Exams feature's daily limit.
export function BudgetNote({ budget, students }: { budget: ExamBudget | null; students: number | null }) {
  if (!budget) return null;
  return (
    <p className="flex w-full items-start gap-2 rounded-md bg-sky-100/70 p-3 text-xs text-sky-900 dark:bg-sky-900/30 dark:text-sky-100">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        {students === null
          ? `Each student uses about ${budget.writesPerStudent} writes (this class has not been counted yet, so the total is not known). `
          : `One sitting of this class (${students} student${students === 1 ? "" : "s"}) uses about ${budget.writes.toLocaleString("en-US")} writes, ${budget.percentOfDailyWrites}% of the ${EXAM_DAILY_WRITE_BUDGET.toLocaleString("en-US")} daily limit, plus about ${budget.reads.toLocaleString("en-US")} reads. `}
        {budget.downloadMbPerStudent > 0
          ? `Its pictures add about ${budget.downloadMbPerStudent} MB downloaded per student${students === null ? "" : ` (about ${budget.downloadMb.toLocaleString("en-US")} MB for the class)`}. `
          : ""}
        Spread large sittings over several days.
      </span>
    </p>
  );
}

// The "Online exam" section: the checkbox and, when it is ticked, the settings of the sitting in a tinted panel.
export default function OnlineExamFields({
  register,
  errors,
  online,
  alreadyOnline,
  answerMode,
  releaseMode,
  integrity,
  published,
  budget,
  students,
  onWindowEdited,
}: {
  register: UseFormRegister<ExamFormValues>;
  errors: FieldErrors<ExamFormValues>;
  online: boolean;
  /** The saved exam is already online: the rules do not allow turning it back into a plain one. */
  alreadyOnline: boolean;
  answerMode: string;
  releaseMode: string;
  /** The Supervision chosen now (supervised or unsupervised). */
  integrity: string;
  /** The saved exam is published (students may be sitting it). */
  published: boolean;
  budget: ExamBudget | null;
  students: number | null;
  /** Called when the person edits the opening or closing time, so the form stops filling them in. */
  onWindowEdited: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <FormSection title="Online exam" panel={online}>
      <div className={`${FULL_ROW_CLS} flex flex-col gap-1`}>
        <label className={CHECK_ROW_CLS}>
          <input type="checkbox" disabled={alreadyOnline} {...register("online")} />
          Online exam (students sit it in the app)
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {alreadyOnline
            ? "This exam is online and cannot be turned back into a schedule-only exam."
            : "Leave this unticked to keep the exam as a date in the schedule."}
        </p>
      </div>

      {online && (
        <>
          {published && (
            <p className={`${FULL_ROW_CLS} text-xs text-amber-600 dark:text-amber-400`}>
              This exam is published, so students may already be sitting it. A change to the window or duration applies to
              attempts started afterwards; attempts under way keep the deadline they started with.
            </p>
          )}

          <InputField
            label="Opens"
            name="opensAt"
            type="datetime-local"
            register={register}
            error={errors.opensAt}
            inputProps={{ onChange: onWindowEdited }}
            variant="roomy"
          />
          <InputField
            label="Closes"
            name="closesAt"
            type="datetime-local"
            register={register}
            error={errors.closesAt}
            inputProps={{ onChange: onWindowEdited }}
            variant="roomy"
          />
          <p className={`${FULL_ROW_CLS} text-xs text-gray-500 dark:text-gray-400`}>
            The window is when students can start. Set the duration ({EXAM_LIMITS.minDurationMinutes} to {EXAM_LIMITS.maxDurationMinutes}{" "}
            minutes) above. A student's own time runs from the moment they start.
          </p>

          {answerMode !== "single" && (
            <div className={ROOMY_FIELD_CLS}>
              <label htmlFor="scoringMode" className={ROOMY_LABEL_CLS}>
                Multiple-answer scoring
              </label>
              <select id="scoringMode" className={ROOMY_INPUT_CLS} {...register("scoringMode")}>
                {EXAM_SCORING_MODES.map((m) => (
                  <option key={m} value={m}>
                    {EXAM_SCORING_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                All or nothing gives the points only for exactly the right choices; partial credit gives a share for each
                right choice and takes one off for each wrong one.
              </p>
              {errors.scoringMode?.message && <p className="text-xs text-red-400">{errors.scoringMode.message}</p>}
            </div>
          )}

          <div className={ROOMY_FIELD_CLS}>
            <label htmlFor="releaseMode" className={ROOMY_LABEL_CLS}>
              Show students the score
            </label>
            <select id="releaseMode" className={ROOMY_INPUT_CLS} {...register("releaseMode")}>
              {EXAM_RELEASE_MODES.map((m) => (
                <option key={m} value={m}>
                  {EXAM_RELEASE_MODE_LABELS[m]}
                </option>
              ))}
            </select>
            {errors.releaseMode?.message && <p className="text-xs text-red-400">{errors.releaseMode.message}</p>}
          </div>

          {releaseMode === "scheduled" && (
            <InputField label="Release scores at" name="releaseAt" type="datetime-local" register={register} error={errors.releaseAt} variant="roomy" />
          )}

          <div className={ROOMY_FIELD_CLS}>
            <label htmlFor="checkpointMinutes" className={ROOMY_LABEL_CLS}>
              Save answers every
            </label>
            <select id="checkpointMinutes" className={ROOMY_INPUT_CLS} {...register("checkpointMinutes")}>
              {CHECKPOINT_CHOICES.map((m) => (
                <option key={m} value={String(m)}>
                  {m} minutes
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400">More often loses less if a connection drops, and uses more of the daily writes.</p>
            {errors.checkpointMinutes?.message && <p className="text-xs text-red-400">{errors.checkpointMinutes.message}</p>}
          </div>

          <div className={ROOMY_FIELD_CLS}>
            <label htmlFor="integrity" className={ROOMY_LABEL_CLS}>
              Supervision
            </label>
            <select id="integrity" className={ROOMY_INPUT_CLS} {...register("integrity")}>
              {EXAM_INTEGRITY_PRESETS.map((m) => (
                <option key={m} value={m}>
                  {EXAM_INTEGRITY_OPTION_TEXT[m]}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Both record when a student leaves the page and switch off copying on the questions. Unsupervised also asks for
              fullscreen, shows the student&apos;s name faintly over the questions and uses a stricter Review mark. A change applies to
              attempts started afterwards.
            </p>
            {errors.integrity?.message && <p className="text-xs text-red-400">{errors.integrity.message}</p>}
          </div>

          {integrity === "unsupervised" && (
            <div className={`${FULL_ROW_CLS} flex flex-col gap-1`}>
              <label className={CHECK_ROW_CLS}>
                <input type="checkbox" {...register("forwardOnly")} />
                Forward only
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Students move to the next question and cannot go back to one they have left.
              </p>
              {errors.forwardOnly?.message && <p className="text-xs text-red-400">{errors.forwardOnly.message}</p>}
            </div>
          )}

          <div className={`${FULL_ROW_CLS} flex flex-col gap-2`}>
            <label className={CHECK_ROW_CLS}>
              <input type="checkbox" {...register("autoGrade")} />
              Auto-Grade (the app marks the attempts from the answer key)
            </label>
            <label className={CHECK_ROW_CLS}>
              <input type="checkbox" {...register("shuffle")} />
              Shuffle the questions and options for each student
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Auto-Grade needs a complete answer key before the exam can be published. Marking runs when you open the exam's
              results.
            </p>
          </div>

          <div className={FULL_ROW_CLS}>
            <BudgetNote budget={budget} students={students} />
          </div>
        </>
      )}
    </FormSection>
  );
}
