import { canContinue, conflicts, pending, questionLabel, statusOf, summary, type ReviewItem } from "@/lib/examImportReview";
import { PRIMARY_BUTTON_CLS, SECONDARY_BUTTON_CLS } from "./builderStyles";

const SMALL_BTN =
  "w-fit rounded-md px-2 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-sky-300 dark:ring-sky-700 dark:hover:bg-sky-900/20";
const SELECT_CLS =
  "w-full rounded-md p-1.5 text-xs ring-[1.5px] ring-gray-300 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-600 disabled:opacity-40";

const BADGE: Record<ReviewItem["confidence"], { label: string; cls: string }> = {
  clear: { label: "Clear", cls: "rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-200" },
  check: { label: "Check", cls: "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" },
  unassigned: { label: "No question", cls: "rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200" },
};

// The picture step of a Word import (EXAM_IMAGES_AND_INTEGRITY_SPEC.md §8.4): every picture the file held, the question the
// reader matched it to and how sure it was, what the picture check did to it, and Use, Move or Remove. Presentational: the
// import dialog keeps the list (lib/examImportReview.ts) and nothing is stored here.
export default function ImportImageReview({
  items,
  questions,
  onUse,
  onMove,
  onRemove,
  onUseAllClear,
  onAddSnapshot,
  onBack,
  onContinue,
}: {
  items: readonly ReviewItem[];
  questions: readonly { text: string }[];
  onUse: (index: number) => void;
  onMove: (index: number, questionIndex: number) => void;
  onRemove: (index: number) => void;
  onUseAllClear: () => void;
  /** Only for a PDF: opens the snapshot tool. */
  onAddSnapshot?: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const done = items.filter((i) => i.prepared !== null || i.refusal !== null).length;
  const preparing = done < items.length;
  const clashes = conflicts(items);
  const waiting = pending(items).length;
  const anyClear = items.some((i) => i.confidence === "clear" && i.decision === "undecided" && i.prepared !== null && i.refusal === null);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {items.length === 0 ? "No picture was found in the file." : `The file has ${items.length} picture${items.length === 1 ? "" : "s"}.`} Check where each one goes. A question can keep only one. Nothing is saved until you press Save in the
        builder.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={SMALL_BTN} disabled={preparing || !anyClear} onClick={onUseAllClear}>
          Use all clear ones
        </button>
        {onAddSnapshot && (
          <button type="button" className={SMALL_BTN} onClick={onAddSnapshot}>
            Add a snapshot of a figure
          </button>
        )}
        <p role="status" className="text-xs text-gray-600 dark:text-gray-300">
          {preparing ? `Preparing pictures ${done} of ${items.length}…` : summary(items)}
          {!preparing && waiting > 0 ? ` ${waiting} still need${waiting === 1 ? "s" : ""} a decision.` : ""}
        </p>
      </div>

      <ul className="grid max-h-[55dvh] gap-3 overflow-y-auto sm:grid-cols-2" aria-label="Pictures in the file">
        {items.map((item) => {
          const status = statusOf(item);
          const clash = item.questionIndex !== null && clashes[item.questionIndex]?.includes(item.index);
          const where = item.questionIndex !== null ? questionLabel(questions[item.questionIndex] ?? { text: "" }, item.questionIndex) : "No question";
          const canUse = item.prepared !== null && item.refusal === null && item.questionIndex !== null && item.decision !== "use";
          return (
            <li key={item.index} className="flex gap-3 rounded-md p-3 ring-1 ring-gray-200 dark:ring-gray-700">
              <div className="flex h-24 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 text-center text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                {item.prepared ? (
                  <img src={item.prepared.data} alt={item.alt} draggable={false} className="max-h-full max-w-full object-contain" />
                ) : item.refusal ? (
                  "Not shown"
                ) : (
                  "Preparing…"
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={BADGE[item.confidence].cls}>{BADGE[item.confidence].label}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">Picture {item.index + 1}</span>
                </div>
                <p className="break-words text-xs font-medium text-gray-800 dark:text-gray-100">{where}</p>
                {item.prepared && <p className="text-xs text-gray-500 dark:text-gray-400">{item.prepared.report}</p>}
                {item.refusal && <p className="text-xs text-red-700 dark:text-red-300">{item.refusal}</p>}
                {status === "dropped" && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Not on a question. It will not be imported unless you move it to one.</p>
                )}
                {status === "pending" && <p className="text-xs text-amber-700 dark:text-amber-300">Needs a decision.</p>}
                {status === "used" && <p className="text-xs font-medium text-green-700 dark:text-green-300">Will be used.</p>}
                {status === "removed" && !item.refusal && <p className="text-xs text-gray-500 dark:text-gray-400">Removed.</p>}
                {clash && (
                  <p role="alert" className="text-xs text-red-700 dark:text-red-300">
                    Another picture is also used for this question. Remove or move one.
                  </p>
                )}
                {!item.refusal && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={SMALL_BTN} disabled={!canUse} onClick={() => onUse(item.index)}>
                      Use
                    </button>
                    <button type="button" className={SMALL_BTN} disabled={item.decision === "removed"} onClick={() => onRemove(item.index)}>
                      Remove
                    </button>
                  </div>
                )}
                {!item.refusal && (
                  <select
                    aria-label={`Move picture ${item.index + 1} to a question`}
                    className={SELECT_CLS}
                    disabled={item.prepared === null}
                    value=""
                    onChange={(e) => {
                      if (e.target.value !== "") onMove(item.index, Number(e.target.value));
                    }}
                  >
                    <option value="">Move to a question…</option>
                    {questions.map((q, i) => (
                      <option key={i} value={i}>
                        {questionLabel(q, i)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onBack} className={SECONDARY_BUTTON_CLS}>
          Back
        </button>
        <button
          type="button"
          disabled={preparing || !canContinue(items)}
          onClick={onContinue}
          className={PRIMARY_BUTTON_CLS}
          style={{ backgroundColor: "var(--brand-button-bg, #0284c7)" }}
        >
          Review in the builder
        </button>
      </div>
    </div>
  );
}
