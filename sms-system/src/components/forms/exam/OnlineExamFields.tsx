import type { ChangeEvent } from "react";
import type { FieldErrors, UseFormRegister } from "react-hook-form";
import InputField from "../../InputField";
import { LABEL_CLS, SELECT_CLS } from "../assignment/styles";
import type { ExamFormValues } from "./examFormSchema";
import { EXAM_DAILY_WRITE_BUDGET, type ExamBudget } from "@/lib/examBudget";
import { EXAM_LIMITS, EXAM_RELEASE_MODES, EXAM_RELEASE_MODE_LABELS, EXAM_SCORING_MODES, EXAM_SCORING_MODE_LABELS } from "@/types/exams";

const BOX_CLS = "flex flex-col gap-2 w-full md:w-1/4";
const CHECKPOINT_CHOICES = [5, 10, 15] as const;

// The note under the online settings: what one sitting of the class costs against the free daily limits.
export function BudgetNote({ budget, students }: { budget: ExamBudget | null; students: number | null }) {
  if (!budget) return null;
  return (
    <p className="text-xs text-gray-500 dark:text-gray-300 w-full">
      {students === null
        ? `Each student uses about ${budget.writesPerStudent} writes (this class has not been counted yet, so the total is not known). `
        : `One sitting of this class (${students} student${students === 1 ? "" : "s"}) uses about ${budget.writes.toLocaleString("en-US")} writes, ${budget.percentOfDailyWrites}% of the ${EXAM_DAILY_WRITE_BUDGET.toLocaleString("en-US")} daily limit, plus about ${budget.reads.toLocaleString("en-US")} reads. `}
      Spread large sittings over several days.
    </p>
  );
}

// The "Online exam" checkbox and, when it is ticked, the settings of the sitting.
export default function OnlineExamFields({
  register,
  errors,
  online,
  alreadyOnline,
  answerMode,
  releaseMode,
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
  /** The saved exam is published (students may be sitting it). */
  published: boolean;
  budget: ExamBudget | null;
  students: number | null;
  /** Called when the person edits the opening or closing time, so the form stops filling them in. */
  onWindowEdited: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-2 w-full">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" disabled={alreadyOnline} {...register("online")} />
          Online exam (students sit it in the app)
        </label>
        <p className="text-xs text-gray-400">
          {alreadyOnline
            ? "This exam is online and cannot be turned back into a schedule-only exam."
            : "Leave this unticked to keep the exam as a date in the schedule."}
        </p>
      </div>

      {online && (
        <>
          {published && (
            <p className="text-xs text-amber-500 w-full">
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
          />
          <InputField
            label="Closes"
            name="closesAt"
            type="datetime-local"
            register={register}
            error={errors.closesAt}
            inputProps={{ onChange: onWindowEdited }}
          />
          <p className="text-xs text-gray-400 w-full">
            The window is when students can start. Set the duration ({EXAM_LIMITS.minDurationMinutes} to {EXAM_LIMITS.maxDurationMinutes}{" "}
            minutes) above. A student's own time runs from the moment they start.
          </p>

          {answerMode !== "single" && (
            <div className={BOX_CLS}>
              <label className={LABEL_CLS}>Scoring of multiple-answer questions</label>
              <select className={SELECT_CLS} {...register("scoringMode")}>
                {EXAM_SCORING_MODES.map((m) => (
                  <option key={m} value={m}>
                    {EXAM_SCORING_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400">
                All or nothing gives the points only for exactly the right choices; partial credit gives a share for each
                right choice and takes one off for each wrong one.
              </p>
              {errors.scoringMode?.message && <p className="text-xs text-red-400">{errors.scoringMode.message}</p>}
            </div>
          )}

          <div className={BOX_CLS}>
            <label className={LABEL_CLS}>Show students their score</label>
            <select className={SELECT_CLS} {...register("releaseMode")}>
              {EXAM_RELEASE_MODES.map((m) => (
                <option key={m} value={m}>
                  {EXAM_RELEASE_MODE_LABELS[m]}
                </option>
              ))}
            </select>
            {errors.releaseMode?.message && <p className="text-xs text-red-400">{errors.releaseMode.message}</p>}
          </div>

          {releaseMode === "scheduled" && (
            <InputField label="Release scores at" name="releaseAt" type="datetime-local" register={register} error={errors.releaseAt} />
          )}

          <div className={BOX_CLS}>
            <label className={LABEL_CLS}>Save answers every</label>
            <select className={SELECT_CLS} {...register("checkpointMinutes")}>
              {CHECKPOINT_CHOICES.map((m) => (
                <option key={m} value={String(m)}>
                  {m} minutes
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400">More often loses less if a connection drops, and uses more of the daily writes.</p>
            {errors.checkpointMinutes?.message && <p className="text-xs text-red-400">{errors.checkpointMinutes.message}</p>}
          </div>

          <div className="flex flex-col gap-2 w-full">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register("autoGrade")} />
              Auto-Grade (the app marks the attempts from the answer key)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register("shuffle")} />
              Shuffle the questions and options for each student
            </label>
            <p className="text-xs text-gray-400">
              Auto-Grade needs a complete answer key before the exam can be published. Marking runs when you open the exam's
              results.
            </p>
          </div>

          <BudgetNote budget={budget} students={students} />
        </>
      )}
    </>
  );
}
