import {
  isCapped,
  levelPoints,
  rubricMax,
  scoreState,
  scoreTotal,
  type RubricPicks,
} from "@/lib/rubricScoring";
import type { RubricCriterion } from "@/types/assessment";

// The Grade dialog's rubric section (RUBRICS_UPLOAD_SPEC.md section 6.14): a level to pick for each criterion, or
// points to type for one with no levels, and the running total. Optional: with nothing picked, the grade is saved
// without rubric scores. Picks only change the picks; the dialog fills Score and Max Score from them.

const LEVEL_BTN_CLS =
  "min-h-11 rounded-md border px-3 py-1.5 text-left text-xs aria-pressed:border-sky-600 aria-pressed:bg-sky-50 aria-pressed:font-semibold aria-pressed:text-sky-800 dark:aria-pressed:bg-sky-900/40 dark:aria-pressed:text-sky-200 border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700";

const pts = (n: number) => `${n} pt${n === 1 ? "" : "s"}`;

function withPick(
  picks: RubricPicks,
  id: string,
  pick: RubricPicks[string] | null,
): RubricPicks {
  const next = { ...picks };
  if (pick) next[id] = pick;
  else delete next[id];
  return next;
}

type PickerProps = {
  criterion: RubricCriterion;
  picks: RubricPicks;
  onChange: (next: RubricPicks) => void;
  disabled: boolean;
};

// Points typed for a criterion with no levels; an empty box is no pick.
function PointsBox({ criterion, picks, onChange, disabled }: PickerProps) {
  const pick = picks[criterion.id];
  const typed = (text: string) =>
    onChange(
      withPick(
        picks,
        criterion.id,
        text.trim() === "" ? null : { points: Number(text) },
      ),
    );
  return (
    <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-300">
      Points
      <input
        type="number"
        min={0}
        max={criterion.maxPoints}
        step="any"
        value={pick ? String(pick.points) : ""}
        onChange={(e) => typed(e.target.value)}
        disabled={disabled}
        className="w-24 rounded-md p-2 text-sm ring-[1.5px] ring-gray-300 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-600"
      />
      <span>out of {criterion.maxPoints}</span>
    </label>
  );
}

// A button per level, with its description so it can be read on a touch screen; pressing the picked one again
// unpicks it.
function LevelButtons({ criterion, picks, onChange, disabled }: PickerProps) {
  const picked = picks[criterion.id]?.level;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {criterion.levels.map((level, i) => {
        const pressed = picked === level.label;
        const points = levelPoints(level, criterion);
        const pick = pressed ? null : { points, level: level.label };
        return (
          <button
            key={i}
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={() => onChange(withPick(picks, criterion.id, pick))}
            className={LEVEL_BTN_CLS}
          >
            {level.label} · {pts(points)}
            {isCapped(level, criterion) && (
              <span className="block font-normal text-amber-700 dark:text-amber-300">
                Counts as the criterion's max, not {level.points}
              </span>
            )}
            {level.description && (
              <span className="mt-0.5 block font-normal text-gray-500 dark:text-gray-400">
                {level.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function CriterionPicker(props: PickerProps) {
  const { criterion } = props;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 flex w-full items-start justify-between gap-3 text-sm font-medium">
        <span>{criterion.name}</span>
        <span className="shrink-0 text-xs font-normal text-gray-500 dark:text-gray-400">
          {pts(criterion.maxPoints)} max
        </span>
      </legend>
      {criterion.levels.length === 0 ? (
        <PointsBox {...props} />
      ) : (
        <LevelButtons {...props} />
      )}
    </fieldset>
  );
}

export function RubricScorePicker({
  criteria,
  picks,
  onChange,
  disabled,
}: {
  criteria: RubricCriterion[];
  picks: RubricPicks;
  onChange: (next: RubricPicks) => void;
  disabled: boolean;
}) {
  const state = scoreState(criteria, picks);
  return (
    <section
      aria-label="Score with the rubric"
      className="flex flex-col gap-3 rounded-md border border-gray-200 p-3 dark:border-gray-700"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Rubric (optional)</h3>
        {state.kind !== "none" && (
          <button
            type="button"
            className="text-xs text-sky-600 underline disabled:opacity-50"
            onClick={() => onChange({})}
            disabled={disabled}
          >
            Clear rubric scores
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Pick a level for each criterion to fill in the score. You can still
        change the score.
      </p>
      {criteria.map((c) => (
        <CriterionPicker
          key={c.id}
          criterion={c}
          picks={picks}
          onChange={onChange}
          disabled={disabled}
        />
      ))}
      <p className="text-sm font-medium" aria-live="polite">
        Rubric total: {scoreTotal(criteria, picks)} / {rubricMax(criteria)}
      </p>
      {state.kind === "partial" && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Still to score: {state.missing.join(", ")}.
        </p>
      )}
    </section>
  );
}
