import type { Dispatch, SetStateAction } from "react";
import { newCriterion, newLevel } from "@/lib/rubricCriteria";
import type { RubricCriterion, RubricLevel } from "@/types/assessment";

const SELECT_CLS =
  "ring-[1.5px] ring-gray-300 p-2 rounded-md text-sm w-full dark:ring-gray-600 dark:bg-gray-900 dark:text-gray-100";
const LABEL_CLS = "text-xs text-gray-500 dark:text-gray-300";

// The criteria grid's editor, shared by the rubric form and the review of a grid read from a file
// (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7.1). Plain state with explicit add and remove handlers, rather than
// react-hook-form: criteria and levels nest two levels deep, and nothing else here uses useFieldArray.
export default function RubricCriteriaEditor({
  criteria,
  onChange,
  canRemoveLast,
}: {
  criteria: RubricCriterion[];
  onChange: Dispatch<SetStateAction<RubricCriterion[]>>;
  /** A rubric that holds a file may have no grid, so its last criterion can go too. */
  canRemoveLast: boolean;
}) {
  const updateCriterion = (id: string, patch: Partial<RubricCriterion>) => {
    onChange((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const updateLevel = (
    criterionId: string,
    index: number,
    patch: Partial<RubricLevel>,
  ) => {
    onChange((prev) =>
      prev.map((c) =>
        c.id === criterionId
          ? {
              ...c,
              levels: c.levels.map((lvl, i) =>
                i === index ? { ...lvl, ...patch } : lvl,
              ),
            }
          : c,
      ),
    );
  };

  const addLevel = (criterionId: string) => {
    onChange((prev) =>
      prev.map((c) =>
        c.id === criterionId ? { ...c, levels: [...c.levels, newLevel()] } : c,
      ),
    );
  };

  const removeLevel = (criterionId: string, index: number) => {
    onChange((prev) =>
      prev.map((c) =>
        c.id === criterionId
          ? { ...c, levels: c.levels.filter((_, i) => i !== index) }
          : c,
      ),
    );
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Criteria</h2>
        <button
          type="button"
          onClick={() => onChange((prev) => [...prev, newCriterion()])}
          className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          + Add criterion
        </button>
      </div>

      {criteria.map((criterion, cIndex) => (
        <div
          key={criterion.id}
          className="flex flex-col gap-3 p-3 rounded-md ring-[1.5px] ring-gray-200 dark:ring-gray-700"
        >
          <div className="flex flex-wrap gap-4 items-start">
            <div className="flex flex-col gap-2 flex-1 min-w-[200px]">
              <label className={LABEL_CLS}>Criterion name</label>
              <input
                value={criterion.name}
                onChange={(e) =>
                  updateCriterion(criterion.id, { name: e.target.value })
                }
                className={SELECT_CLS}
              />
            </div>
            <div className="flex flex-col gap-2 w-32">
              <label className={LABEL_CLS}>Max points</label>
              <input
                type="number"
                min={0}
                value={criterion.maxPoints}
                onChange={(e) =>
                  updateCriterion(criterion.id, {
                    maxPoints: Number(e.target.value),
                  })
                }
                className={SELECT_CLS}
              />
            </div>
            {(criteria.length > 1 || canRemoveLast) && (
              <button
                type="button"
                onClick={() =>
                  onChange((prev) => prev.filter((_, i) => i !== cIndex))
                }
                className="text-xs font-medium px-3 py-1.5 mt-5 rounded-md border border-gray-300 dark:border-gray-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700"
              >
                Remove criterion
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className={LABEL_CLS}>Performance levels</label>
              <button
                type="button"
                onClick={() => addLevel(criterion.id)}
                className="text-xs font-medium px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                + Add level
              </button>
            </div>
            {criterion.levels.map((lvl, lIndex) => (
              <div key={lIndex} className="flex flex-wrap gap-2 items-center">
                <input
                  placeholder="Label (e.g. Excellent)"
                  value={lvl.label}
                  onChange={(e) =>
                    updateLevel(criterion.id, lIndex, {
                      label: e.target.value,
                    })
                  }
                  className={`${SELECT_CLS} flex-1 min-w-[140px]`}
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Points"
                  value={lvl.points}
                  onChange={(e) =>
                    updateLevel(criterion.id, lIndex, {
                      points: Number(e.target.value),
                    })
                  }
                  className={`${SELECT_CLS} w-24`}
                />
                <input
                  placeholder="Description (optional)"
                  value={lvl.description ?? ""}
                  onChange={(e) =>
                    updateLevel(criterion.id, lIndex, {
                      description: e.target.value,
                    })
                  }
                  className={`${SELECT_CLS} flex-1 min-w-[160px]`}
                />
                {criterion.levels.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLevel(criterion.id, lIndex)}
                    className="text-xs text-red-600 dark:text-red-400 px-2"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
